# 서비스 단위 배포 구조 전환 방향

## 배경

현재 `k8s/` 구조는 서비스 단위보다 레이어 단위에 가깝다.

```text
k8s/
  namespaces/
  storage/
  kong/
  network-policies/
  base/apps/
  base/deps/
  overlays/local/*
  overlays/aws/*
```

이 구조는 초기 Kubernetes 구성을 한 번에 렌더링하고 전체 플랫폼을 파악하기에는 편하다. 하지만 PRD의 최종 목표인 서비스별 독립 배포, 독립 확장, 장애 격리까지 생각하면 점점 한계가 생긴다.

PRD에서 특히 중요한 기준은 다음이다.

- 각 서비스가 독립적으로 배포, 확장, 장애 격리 가능해야 한다.
- 서비스별 독립 데이터베이스 원칙을 유지해야 한다.
- 서비스별 독립 배포 파이프라인을 분리해야 한다.
- 한 서비스의 배포가 다른 서비스에 영향을 주지 않음을 E2E 테스트로 검증해야 한다.
- PDB, ServiceAccount, NetworkPolicy 같은 운영/보안 리소스도 서비스 경계에 맞춰 관리해야 한다.

따라서 현재 구조는 GitOps repo 초기 이주 단계의 reference로 유지하고, 장기 운영 구조는 서비스 단위 Helm release 중심으로 전환한다.

## 목표 환경

최종적으로 관리할 환경은 세 가지다.

| 환경 | 목적 | 특징 |
|---|---|---|
| `local` | 개인 로컬 Kubernetes 실습과 빠른 검증 | local registry, MetalLB, 낮은 리소스 기준 |
| `aws-dev` | 클라우드 개발/검증 환경 | ECR image, AWS load balancer, dev용 리소스와 관측성 |
| `aws-prod` | 운영형 환경 | 더 엄격한 보안 정책, PDB/HPA, 운영 리소스, 점진 배포 |

환경이 늘어나더라도 서비스 chart는 같게 유지하고, 차이는 values layering으로 분리한다.

## 결정된 구조

서비스별 독립 배포의 기본 단위는 Helm release다. 공통 Kubernetes 리소스 템플릿은 `charts/medikong-service/templates/*`에 둔다.

```text
gitops/
  charts/
    medikong-service/
      Chart.yaml
      values.yaml
      values.schema.json
      templates/
        deployment.yaml
        service.yaml
        ingress.yaml
        serviceaccount.yaml
        role.yaml
        rolebinding.yaml
        networkpolicy.yaml
        pdb.yaml
        hpa.yaml
        servicemonitor.yaml
  values/
    base.yaml
    env/
      local.yaml
      aws-dev.yaml
      aws-prod.yaml
    services/
      patient.yaml
      appointment.yaml
      auth.yaml
      prescription.yaml
      notification.yaml
      dashboard.yaml
    overrides/
      aws-prod/
        patient.yaml
  platform/
    namespaces/
    kong/
    observability/
    policies/
```

values 적용 순서는 다음이다.

```text
base
-> env
-> service
-> optional service-env override
```

예를 들어 `patient`를 `aws-dev`에 렌더링할 때는 다음처럼 조합한다.

```bash
helm template patient-aws-dev charts/medikong-service \
  -f values/base.yaml \
  -f values/env/aws-dev.yaml \
  -f values/services/patient.yaml
```

`aws-prod`에서 `patient`만 별도 리소스나 replica 설정이 필요하면 마지막에 override를 추가한다.

```bash
helm template patient-aws-prod charts/medikong-service \
  -f values/base.yaml \
  -f values/env/aws-prod.yaml \
  -f values/services/patient.yaml \
  -f values/overrides/aws-prod/patient.yaml
```

## Platform과 Service의 경계

모든 것을 서비스 chart에 넣지는 않는다. 플랫폼 공통 리소스와 서비스 리소스를 분리한다.

| 영역 | 위치 | 이유 |
|---|---|---|
| Namespace 기본 생성 | `platform/namespaces` | 서비스 release보다 먼저 있어야 하는 공통 기반 |
| Kong Gateway 설치 | `platform/kong` | gateway 자체는 서비스가 아니라 cluster ingress layer |
| Observability stack | `platform/observability` | Prometheus, Grafana, Loki, Tempo는 공통 운영 add-on |
| Gatekeeper/Falco | `platform/policies` | cluster-level 보안 정책 |
| Deployment/Service/Ingress | `charts/medikong-service` + `values/services/*` | 서비스 배포와 함께 바뀌는 release 리소스 |
| ServiceMonitor | `charts/medikong-service` + values | 서비스별 metrics endpoint와 함께 관리 |
| ServiceAccount/RBAC | `charts/medikong-service` + values | 최소 권한 원칙을 서비스 단위로 적용 |
| NetworkPolicy | `charts/medikong-service` + values | 서비스 간 통신 경계를 서비스 단위로 검증 |

기존 `k8s/` Kustomize 구조는 reference와 기존 검증 경로로 유지한다. 새 구조가 안정화될 때까지 삭제하거나 대체하지 않는다.

## Image Tag 관리

GitOps repo는 image를 만들지 않는다.

서비스 repo 또는 release pipeline이 image를 만들고 registry에 게시한다. GitOps repo는 그 결과 tag를 values에 반영한다.

```yaml
image:
  repository: patient-service
  tag: 2026.05.21-abc1234
```

registry처럼 환경별로 달라지는 값은 `values/env/*`에 둔다.

```yaml
image:
  registry: 941141115079.dkr.ecr.ap-northeast-2.amazonaws.com
```

단일 서비스 배포에서는 `values/services/<service>.yaml` 또는 `values/overrides/<env>/<service>.yaml`만 변경하는 것을 원칙으로 한다. `values/env/*`나 chart template 변경은 같은 환경 또는 전체 서비스에 영향을 줄 수 있으므로 플랫폼 배포 표준 변경으로 취급한다.

## Database per Service

PRD는 서비스별 독립 데이터베이스를 요구한다. 다만 DB lifecycle은 앱 Deployment lifecycle과 같지 않다.

그래서 DB는 두 단계로 나누는 것이 좋다.

1. 로컬과 초기 dev에서는 서비스별 PostgreSQL StatefulSet을 GitOps로 관리한다.
2. `aws-dev`, `aws-prod`에서는 RDS 같은 외부 DB를 연결하고, GitOps repo는 Secret 참조와 연결 설정만 관리한다.

앱 chart에는 DB StatefulSet을 직접 넣지 않는다. 앱 배포와 DB 변경의 위험을 분리하기 위해 DB release는 별도 chart 또는 platform/data 영역에서 다룬다.

## Argo CD 구조

초기에는 환경별 App of Apps 패턴이 적합하다.

```text
argo/applications/local/root.yaml
argo/applications/aws-dev/root.yaml
argo/applications/aws-prod/root.yaml
```

각 root application이 서비스별 application을 묶는다.

```text
patient-local
patient-aws-dev
patient-aws-prod
auth-local
appointment-local
...
```

서비스별 Application은 같은 chart와 values 조합을 사용한다.

```yaml
source:
  repoURL: https://github.com/Medikong/gitops.git
  targetRevision: HEAD
  path: charts/medikong-service
  helm:
    valueFiles:
      - ../../values/base.yaml
      - ../../values/env/aws-dev.yaml
      - ../../values/services/patient.yaml
```

이 구조에서는 `patient`만 sync, rollback, canary 전환하는 흐름이 가능해진다.

## 전환 순서

한 번에 전체를 Helm으로 바꾸지 않는다. 현재 Kustomize 구조는 안정적인 reference로 유지하면서 한 서비스씩 옮긴다.

1. 서비스 release model 문서를 확정한다.
2. 공통 `charts/medikong-service` 초안을 만든다.
3. `patient` 서비스를 pilot으로 Helm chart values 구조를 검증한다.
4. `local`, `aws-dev`, `aws-prod` values 조합으로 `patient`를 렌더링한다.
5. `patient`에서 PDB, HPA, ServiceAccount, NetworkPolicy, ServiceMonitor까지 서비스 단위로 묶는다.
6. 같은 패턴을 `auth`, `appointment`, `prescription`, `notification`, `dashboard`로 확장한다.
7. 서비스별 Helm release가 안정화되면 Argo CD Application을 서비스별로 분리한다.
8. 기존 레이어형 Kustomize overlay 축소 여부는 마지막에 결정한다.

## Pilot 서비스

`patient`가 첫 번째 후보로 적합하다.

- 핵심 도메인이면서 다른 서비스보다 흐름이 이해하기 쉽다.
- DB per Service, Kong route, NetworkPolicy, ServiceMonitor를 모두 검증할 수 있다.
- CRUD smoke test로 배포 후 확인이 가능하다.

`auth`는 인증과 JWT credential이 걸려 있어 첫 pilot으로는 약간 더 조심스럽다. `appointment`나 `prescription`은 Kafka 이벤트 흐름까지 같이 봐야 하므로 두 번째 단계가 더 적합하다.

## 대안으로 남긴 구조

다음 구조는 채택안이 아니다. 서비스 폴더만 보면 설정을 모아볼 수 있다는 장점은 있지만, Helm `valueFiles` 목록이 길어지고 repo 자체 규칙이 늘어난다.

```text
apps/
  patient/
    values.yaml
    networking.yaml
    scaling.yaml
    observability.yaml
```

서비스별 chart를 완전히 분리하는 방식도 초기에는 채택하지 않는다. 거의 같은 템플릿이 서비스마다 복제되고, 보안 기본값이나 배포 표준을 일괄 적용하기 어렵기 때문이다.

## 검증 명령

Kustomize reference 구조는 계속 검증한다.

```bash
make validate
kubectl kustomize k8s/overlays/local/all
kubectl kustomize k8s/overlays/aws/all
```

Helm foundation은 별도 target으로 검증한다.

```bash
make helm-lint
make helm-template-patient-local
make helm-template-patient-aws-dev
make helm-template-patient-aws-prod
```

공통 chart가 바뀐 경우에는 모든 서비스와 환경 조합을 렌더링해야 한다. 서비스 values만 바뀐 경우에는 해당 서비스와 대상 환경 렌더링을 최소 검증 단위로 삼는다.
