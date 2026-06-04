# Observability platform resources

`platform/observability`는 trace/log backend처럼 서비스 Helm release와 lifecycle이 다른 관측성 backend를 둔다.

Prometheus와 Grafana는 `platform/monitoring`의 kube-prometheus-stack 운영 경로로 유지한다. 서비스별 `ServiceMonitor`도 계속 `charts/medikong-service` release가 관리한다.

## 경계

```text
platform/monitoring
  - Prometheus
  - Alertmanager
  - Grafana
  - Grafana datasource 선언

platform/observability
  - OpenTelemetry Collector trace pipeline
  - Tempo trace backend
  - Loki log backend
```

## 컴포넌트

```text
tempo/
  - Tempo Helm values
  - trace retention/storage/resource 기준
  - 로컬 render Taskfile

collector/
  - OpenTelemetry Collector Helm values
  - OTLP receiver와 Tempo exporter trace pipeline
  - ServiceMonitor/NetworkPolicy 기준
  - 로컬 render Taskfile

loki/
  - Loki Helm values
  - log retention/storage/resource 기준
  - label/cardinality 정책
  - 로컬 render Taskfile
```

## 신호별 경로

ADR 0004 기준으로 신호별 경로를 섞지 않는다.

```text
metric
  FastAPI /metrics
  -> ServiceMonitor
  -> Prometheus scrape
  -> Grafana

trace
  FastAPI OpenTelemetry instrumentation
  -> OTLP
  -> OpenTelemetry Collector
  -> Tempo
  -> Grafana

log
  stdout/stderr JSON
  -> Kubernetes container log
  -> OpenTelemetry Collector filelog receiver
  -> Loki
  -> Grafana

audit log
  business event/outbox
  -> 별도 검색/증적 파이프라인
```

이번 Collector 기반 작업은 trace용 OTLP receiver와 Tempo exporter pipeline까지만 다룬다. Loki filelog receiver, metric scrape, audit log pipeline, tail sampling 정책은 별도 작업으로 분리한다.

## Argo CD

aws-dev platform Application은 다음 순서로 붙인다.

```text
monitoring-aws-dev   sync-wave -20
tempo-aws-dev        sync-wave -18
loki-aws-dev         sync-wave -18
opentelemetry-collector-aws-dev  sync-wave -17
service applications service path
```

Tempo/Loki Application은 `CreateNamespace=true`와 `managedNamespaceMetadata`로 `observability` namespace를 만든다. Grafana datasource는 `platform/monitoring/values/kube-prometheus-stack.yaml`에서 Tempo/Loki service DNS를 바라본다.

## Image mirror

aws-dev values는 외부 이미지를 직접 pull하지 않고 ECR image path를 바라본다. 배포 전에 GitOps CI에서 외부 이미지를 ECR로 mirror한다.

이 과정이 필요한 이유:

```text
외부 registry 직접 pull 방식
  - Argo CD sync 시점마다 Docker Hub/Grafana registry 접근이 필요하다.
  - 외부 rate limit, 네트워크 제한, 임시 장애에 배포가 흔들릴 수 있다.
  - 실제 운영 클러스터가 어떤 이미지 digest를 받았는지 통제하기 어렵다.

ECR mirror 방식
  - 배포 전에 검증한 이미지를 내부 ECR에 고정한다.
  - Kubernetes Pod는 ECR에서만 image를 pull한다.
  - 외부 네트워크 의존을 CI 단계로 앞당긴다.
  - aws-dev/prod에서 같은 registry 운영 방식을 사용할 수 있다.
```

환경별/이미지별 ECR 주소, 미러링 대상, 버전은 각 컴포넌트 Helm values에서 함께 관리한다.

```text
platform/observability/tempo/values/aws-dev.yaml
platform/observability/collector/values/aws-dev.yaml
platform/observability/loki/values/aws-dev.yaml
```

각 values 파일의 `imageMirror.images`가 CI 미러링 기준이다. Helm chart schema가 외부 key를 허용하지 않는 컴포넌트는 `image-mirror/<환경>.yaml`에 같은 구조로 둔다. workflow는 `platform/observability/*/values/<환경>.yaml`와 `platform/observability/*/image-mirror/<환경>.yaml`를 함께 스캔한다.

새 이미지 버전이나 ECR registry를 바꿀 때는 chart image 설정과 `imageMirror.images`를 함께 바꾼다.

```text
docker.io/grafana/tempo:2.9.0
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/grafana/tempo:2.9.0

docker.io/otel/opentelemetry-collector:0.153.0
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/otel/opentelemetry-collector:0.153.0

docker.io/grafana/loki:3.6.7
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/grafana/loki:3.6.7

docker.io/kiwigrid/k8s-sidecar:2.5.0
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/kiwigrid/k8s-sidecar:2.5.0
```

미러링 workflow는 수동으로 실행한다.

```text
.github/workflows/observability-image-mirror.yml
```

실행 과정:

```text
1. GitHub Actions에서 Observability Image Mirror workflow를 실행한다.
2. environment input에 aws-dev, qa, prod 같은 환경명을 입력한다.
3. image input에 all 또는 `imageMirror.images[].name` 값을 입력한다.
4. ECR repository가 아직 없으면 create_repositories=true를 켠다.
5. workflow가 platform/observability/*/values/<환경>.yaml와 platform/observability/*/image-mirror/<환경>.yaml을 스캔한다.
6. 외부 원본 이미지를 pull한다.
7. ECR target path로 tag를 바꾼다.
8. ECR에 push한다.
9. 같은 tag가 이미 있으면 기본적으로 건너뛴다.
```

기본값은 기존 repository를 전제로 두고, destination tag가 이미 있으면 push를 건너뛴다. 같은 tag를 다시 덮어써야 할 때만 `force=true`를 사용한다.

## 검증

```bash
task observability:render
task platform:render
task validate
```

Docker Desktop 로컬 배포는 `task dev` 한 번으로 Prometheus/Grafana, Tempo/Loki, Kong, data, service release를 함께 올린다. Tempo/Loki만 따로 확인하려면 각 컴포넌트 Taskfile의 `up`을 사용할 수 있다.

```bash
task dev
task --taskfile platform/observability/collector/Taskfile.yml up
task --taskfile platform/observability/tempo/Taskfile.yml up
task --taskfile platform/observability/loki/Taskfile.yml up
```

live cluster 배포는 사용자가 명시적으로 요청할 때만 실행한다.

## 기존 reference 경로

`cluster/stacks/observability`는 Loki, Alloy, Tempo까지 포함한 수동 설치 reference로 유지한다. 새 GitOps 운영 경로는 `platform/observability/<component>`다.
