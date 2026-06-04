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
  - Tempo trace backend
  - Loki log backend
  - 후속 OpenTelemetry Collector/agent backend 연결 기준
```

## 컴포넌트

```text
tempo/
  - Tempo Helm values
  - trace retention/storage/resource 기준
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

이번 기반 작업은 Tempo, Loki, Grafana datasource 선언까지다. OpenTelemetry Collector OTLP receiver/pipeline, filelog receiver, tail sampling은 후속 작업으로 분리한다.

## Argo CD

aws-dev platform Application은 다음 순서로 붙인다.

```text
monitoring-aws-dev   sync-wave -20
tempo-aws-dev        sync-wave -18
loki-aws-dev         sync-wave -18
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
platform/observability/loki/values/aws-dev.yaml
```

각 values 파일의 `imageMirror.images`가 CI 미러링 기준이다. 새 관측성 컴포넌트를 추가할 때는 해당 컴포넌트의 `values/<환경>.yaml`에 `imageMirror.images`를 같이 추가한다. 그러면 workflow가 `platform/observability/*/values/<환경>.yaml`를 스캔해서 자동으로 미러링 대상에 포함한다.

새 이미지 버전이나 ECR registry를 바꿀 때는 같은 values 파일 안의 chart image 설정과 `imageMirror.images`를 함께 바꾼다.

```text
docker.io/grafana/tempo:2.9.0
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/grafana/tempo:2.9.0

docker.io/grafana/loki:3.6.7
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/grafana/loki:3.6.7

docker.io/kiwigrid/k8s-sidecar:2.5.0
  -> 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com/kiwigrid/k8s-sidecar:2.5.0
```

미러링 workflow는 수동으로 실행한다.

```text
.github/workflows/observability-image-mirror.yml
```

AWS 인증은 GitHub OIDC를 사용한다. 장기 access key를 GitHub secret에 저장하지 않고, workflow 실행 시점에 GitHub가 발급한 OIDC token으로 AWS IAM Role을 assume한다.

사전 준비:

```text
1. AWS IAM에 GitHub Actions OIDC provider를 구성한다.
2. 관측성 이미지 미러링용 IAM Role을 만든다.
3. Role trust policy에서 Medikong/gitops repository의 OIDC subject만 허용한다.
4. Role에 ECR pull/push 권한을 부여한다.
5. GitHub Repository 또는 Organization variable에 OBSERVABILITY_IMAGE_MIRROR_ROLE_ARN을 등록한다.
```

`OBSERVABILITY_IMAGE_MIRROR_ROLE_ARN`이 아직 없으면 workflow_dispatch 입력값 `aws_role_arn`으로 임시 지정할 수 있다. 단, 운영 기준은 repository/organization variable로 관리한다.

현재 workflow는 계정/OIDC 준비 전 커밋을 위해 기본 비활성화되어 있다. `workflow_dispatch`의 `enabled` 기본값은 `false`이며, 실제 미러링을 할 때만 `true`로 바꾼다.

Role 권한은 넓게 열지 않는다. 기본 미러링에는 다음 계열 권한만 필요하다.

```text
ECR login/token
  - ecr:GetAuthorizationToken

ECR repository 확인/생성
  - ecr:DescribeRepositories
  - ecr:CreateRepository

ECR image push
  - ecr:BatchCheckLayerAvailability
  - ecr:InitiateLayerUpload
  - ecr:UploadLayerPart
  - ecr:CompleteLayerUpload
  - ecr:PutImage
```

실행 과정:

```text
1. GitHub Actions에서 Observability Image Mirror workflow를 실행한다.
2. 계정/OIDC 준비가 끝났을 때만 enabled=true로 바꾼다.
3. environment input에 aws-dev, qa, prod 같은 환경명을 입력한다.
4. image input에 all 또는 `imageMirror.images[].name` 값을 입력한다.
5. ECR repository가 아직 없으면 create_repositories=true를 켠다.
6. workflow가 platform/observability/*/values/<환경>.yaml을 스캔한다.
7. 외부 원본 이미지를 pull한다.
8. ECR target path로 tag를 바꾼다.
9. ECR에 push한다.
10. 같은 tag가 이미 있으면 기본적으로 건너뛴다.
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
task --taskfile platform/observability/tempo/Taskfile.yml up
task --taskfile platform/observability/loki/Taskfile.yml up
```

live cluster 배포는 사용자가 명시적으로 요청할 때만 실행한다.

## 기존 reference 경로

`cluster/stacks/observability`는 Loki, Alloy, Tempo까지 포함한 수동 설치 reference로 유지한다. 새 GitOps 운영 경로는 `platform/observability/<component>`다.
