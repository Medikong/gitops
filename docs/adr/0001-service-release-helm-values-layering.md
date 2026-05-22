---
id: ADR-0001
title: 서비스별 독립 배포를 위해 공통 Helm chart와 values layering을 사용한다
status: accepted
date: 2026-05-21
decision_owner: Medikong GitOps
related:
  - ../PRD.md
  - ../architecture/service-release-model.md
tags:
  - gitops
  - kubernetes
  - helm
  - argocd
  - service-release
---

# ADR-0001: 서비스별 독립 배포를 위해 공통 Helm chart와 values layering을 사용한다

## 배경

현재 `k8s/` 구조는 `namespaces`, `storage`, `kong`, `network-policies`, `base/apps`, `base/deps`, `overlays/local/*`, `overlays/aws/*`처럼 레이어 중심으로 나뉘어 있다.

이 구조는 Kubernetes 자산을 초기 이주하고 전체 manifest를 한 번에 렌더링하기에는 적합하다. 하지만 PRD의 장기 목표는 서비스별 독립 배포, 독립 확장, 장애 격리다. 레이어 중심 구조만 유지하면 `patient` 하나를 배포하거나 롤백하려고 할 때 다른 서비스와 같은 overlay 안에서 함께 다뤄질 가능성이 커진다.

장기적으로 관리해야 할 환경은 다음 세 가지다.

| 환경 | 목적 |
|---|---|
| `local` | 개인 로컬 Kubernetes 실습과 빠른 검증 |
| `aws-dev` | 클라우드 개발/검증 환경 |
| `aws-prod` | 운영형 환경 |

서비스별로 필요한 Kubernetes 리소스는 거의 같은 패턴을 가진다.

- `Deployment`
- `Service`
- `Ingress` 또는 Kong route 연동 리소스
- `ServiceAccount`
- `Role`, `RoleBinding`
- `NetworkPolicy`
- `PodDisruptionBudget`
- `HorizontalPodAutoscaler`
- `ServiceMonitor`

이 리소스들을 서비스마다 순수 YAML로 복제하면 중복이 커진다. 반대로 서비스별 values를 리소스 단위 파일로 너무 잘게 쪼개면 파일 수와 Argo CD `valueFiles` 목록이 빠르게 늘어난다.

따라서 이 repo는 Helm의 일반적인 사용 방식에 맞춰 공통 chart template을 두고, 공통값, 환경값, 서비스값, 예외 override를 순서대로 합성하는 구조를 사용한다.

## 결정

서비스별 독립 배포의 기본 단위는 Helm release로 본다.

공통 Kubernetes 리소스 템플릿은 공통 Helm chart에 둔다.

```text
charts/
  medikong-service/
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
```

공통 기본값, 환경별 값, 서비스별 값, 예외 override는 다음 구조로 둔다.

```text
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
```

플랫폼 공통 리소스는 서비스 Helm release와 분리한다.

```text
platform/
  namespaces/
  kong/
  observability/
  policies/
```

Helm values 적용 순서는 다음 원칙을 따른다.

```text
base
-> env
-> service
-> optional service-env override
```

예를 들어 `patient`를 `aws-dev`에 배포할 때 Argo CD Application은 다음 values를 조합한다.

```yaml
helm:
  valueFiles:
    - ../../values/base.yaml
    - ../../values/env/aws-dev.yaml
    - ../../values/services/patient.yaml
```

`aws-prod`에서 `patient`만 별도 리소스나 replica 설정이 필요하면 마지막에 override를 추가한다.

```yaml
helm:
  valueFiles:
    - ../../values/base.yaml
    - ../../values/env/aws-prod.yaml
    - ../../values/services/patient.yaml
    - ../../values/overrides/aws-prod/patient.yaml
```

## 책임 경계

공통 Helm chart는 서비스 배포 표준이다. values 파일은 그 표준에 넣을 입력값이다.

| 영역 | 위치 | 원칙 |
|---|---|---|
| 공통 Kubernetes manifest template | `charts/medikong-service/templates/*` | 중복을 줄이고 배포 표준을 강제한다 |
| 공통 기본값 | `values/base.yaml` | 모든 환경과 서비스에 적용되는 기본값을 둔다 |
| 환경 공통값 | `values/env/*` | `local`, `aws-dev`, `aws-prod` 차이를 표현한다 |
| 서비스별 값 | `values/services/<service>.yaml` | image, port, env, route, resource 등 서비스 고유 설정을 둔다 |
| 예외 override | `values/overrides/<env>/<service>.yaml` | 특정 서비스와 환경의 예외만 둔다 |
| 플랫폼 공통 리소스 | `platform/*` | namespace, gateway, observability, policy처럼 서비스 release와 lifecycle이 다른 리소스를 둔다 |

Namespace 생성은 기본적으로 `platform/namespaces`에서 먼저 관리한다.

서비스 release는 해당 namespace 안의 `Deployment`, `Service`, `Ingress`, `NetworkPolicy`, `ServiceAccount`, `PDB`, `HPA`, `ServiceMonitor`를 관리한다.

## 단일 서비스 배포 흐름

`patient` 서비스만 배포할 때는 서비스 image를 services/release pipeline에서 만들고 registry에 게시한 뒤, GitOps repo에서 `patient`의 image tag만 갱신한다.

```text
services repo
-> patient-service image build/push
-> gitops repo values/services/patient.yaml 또는 values/overrides/<env>/patient.yaml image tag update
-> Argo CD patient-aws-dev Application sync
-> Kubernetes patient Deployment rollout
```

다른 서비스의 values나 Argo CD Application은 변경하지 않는다.

환경 공통값인 `values/env/aws-dev.yaml`을 바꾸면 해당 환경의 여러 서비스에 영향을 줄 수 있다. 그래서 단일 서비스 배포에서는 `values/services/<service>.yaml` 또는 `values/overrides/<env>/<service>.yaml`만 변경하는 것을 원칙으로 한다.

## 대안

### 대안 1: 서비스별 폴더 아래 관심사 단위 values fragment를 둔다

```text
apps/
  patient/
    values.yaml
    networking.yaml
    scaling.yaml
    observability.yaml
```

장점은 서비스 폴더만 보면 해당 서비스 설정을 모아볼 수 있다는 점이다. 단점은 Helm의 기본적인 values layering 구조보다 valueFiles 목록이 길어지고, 서비스 폴더 구조가 또 하나의 자체 규칙이 된다는 점이다.

### 대안 2: 구성요소별 values 파일을 더 잘게 나눈다

```text
apps/patient/values/deployment.yaml
apps/patient/values/service.yaml
apps/patient/values/ingress.yaml
apps/patient/values/network-policy.yaml
apps/patient/values/hpa.yaml
apps/patient/values/pdb.yaml
```

장점은 Kubernetes 리소스와 파일이 1:1로 대응되어 직관적이라는 점이다. 단점은 파일 수가 빠르게 늘고, Argo CD `valueFiles` 목록이 장황해지며, port처럼 여러 리소스에 걸친 값을 놓치기 쉽다는 점이다.

### 대안 3: 서비스별 chart를 완전히 분리한다

```text
charts/patient/
charts/appointment/
charts/auth/
```

장점은 서비스별 자유도가 크다는 점이다. 단점은 거의 같은 템플릿이 서비스마다 복제되고, 보안 기본값이나 배포 표준을 일괄 적용하기 어려워진다는 점이다.

## 결과

이 결정으로 다음 장점이 생긴다.

- 서비스 하나가 Helm release 하나로 배포된다.
- `patient`만 sync, rollback, canary 전환하는 흐름을 만들 수 있다.
- 공통 Kubernetes manifest template 중복이 줄어든다.
- 환경별 차이는 `values/env/*`로 관리한다.
- 서비스별 차이는 `values/services/*`로 관리한다.
- 특정 서비스와 환경의 예외만 `values/overrides/*`에 둔다.
- Helm의 일반적인 values layering 방식에 맞춰 repo 규칙을 단순하게 유지한다.

동시에 다음 위험이 생긴다.

- 공통 chart 변경의 영향 범위가 모든 서비스와 환경으로 커질 수 있다.
- 공통 chart 변경이 협업 병목이 될 수 있다.
- values merge 순서가 배포 결과에 영향을 준다.
- chart가 모든 예외를 받아주기 시작하면 템플릿이 복잡해질 수 있다.
- `values/services/<service>.yaml`이 커지면 서비스 내부 관심사가 한 파일에 섞일 수 있다.

## 대응책

공통 chart 변경은 플랫폼 배포 표준 변경으로 취급한다.

- chart template 변경 PR과 서비스 image tag 변경 PR은 분리한다.
- chart 변경 시 모든 서비스와 환경 조합을 `helm template`으로 렌더링한다.
- `values.schema.json`을 추가해 필수 값과 타입을 검증한다.
- `helm lint`와 manifest 보안 스캔을 CI에서 실행한다.
- 공통 chart가 지나치게 많은 예외를 품기 시작하면 chart를 유형별로 나눈다.
- 서비스 values 파일이 너무 커지면 단일 서비스 안에서만 구조를 재검토하되, 기본 repo 구조는 `values/services/<service>.yaml`를 유지한다.

장기적으로 서비스 유형이 갈라지면 다음처럼 chart를 분리할 수 있다.

```text
charts/
  medikong-api-service/
  medikong-worker/
  medikong-frontend/
```

초기에는 `medikong-service` 하나로 시작하되, chart가 복잡해지는 시점을 chart 분리의 신호로 본다.

## 검증 기준

이 결정이 실제 구조로 구현되면 다음 검증이 가능해야 한다.

```bash
helm lint charts/medikong-service
helm template patient-local charts/medikong-service \
  -f values/base.yaml \
  -f values/env/local.yaml \
  -f values/services/patient.yaml
```

prod override가 있는 서비스는 다음처럼 렌더링한다.

```bash
helm template patient-aws-prod charts/medikong-service \
  -f values/base.yaml \
  -f values/env/aws-prod.yaml \
  -f values/services/patient.yaml \
  -f values/overrides/aws-prod/patient.yaml
```

공통 chart가 바뀐 경우에는 모든 서비스와 환경 조합을 렌더링해야 한다.

서비스 values만 바뀐 경우에는 해당 서비스와 대상 환경 렌더링을 최소 검증 단위로 삼는다.
