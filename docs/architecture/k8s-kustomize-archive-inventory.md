# Kustomize archive inventory

기존 `k8s/`는 `archive/k8s-kustomize/`로 이동했다. 새 운영 경로는 `charts/`, `values/`, `platform/`, `argo/`, `Taskfile.yml`이다.

이 문서는 기존 Kustomize 자산을 삭제 가능 상태로 만들기 전에 누락 없이 이식하기 위한 체크리스트다.

| 기존 위치 | 성격 | 새 위치/방향 | 상태 |
| --- | --- | --- | --- |
| `archive/k8s-kustomize/namespaces` | namespace | `platform/namespaces` | 이식됨 |
| `archive/k8s-kustomize/base/apps/*` | 서비스 Deployment/Service | `charts/medikong-service` + `values/services/*` | Helm values로 6개 서비스 렌더링 대상 |
| `archive/k8s-kustomize/ingress/*` | 서비스 route | `values/services/*` ingress 설정 | 이식됨 |
| `archive/k8s-kustomize/network-policies/*` | 서비스 통신 정책 | `charts/medikong-service` networkPolicy + `values/services/*` | 서비스별 정책 이식됨, messaging 정책은 platform/data에서 재검토 |
| `archive/k8s-kustomize/kong` | Kong values/plugins/consumers | `platform/kong` | 이식 필요 |
| `archive/k8s-kustomize/metallb` | 로컬 LoadBalancer 보조 리소스 | VM 기반 로컬 cluster 보조 문서/스크립트 | 운영 경로 제외, 필요 시 cluster docs에서 참조 |
| `archive/k8s-kustomize/storage` | static PV | `platform/data/storage` 후보 | 이식 필요 |
| `archive/k8s-kustomize/base/deps/db/*` | 초기 dev PostgreSQL | `platform/data/postgres` 또는 별도 chart 후보 | 이식 필요 |
| `archive/k8s-kustomize/base/deps/kafka` | messaging | `platform/data/messaging` 또는 별도 chart 후보 | 이식 필요 |
| `archive/k8s-kustomize/base/deps/outbox-publisher` | outbox worker | 별도 worker release 후보 | 이식 필요 |
| `archive/k8s-kustomize/overlays/*` | 기존 환경 overlay | 새 values layering과 Taskfile 검증 | 운영 경로 종료 |

## 이식 기준

- 서비스 release에 함께 배포되어야 하는 리소스는 `charts/medikong-service`와 `values/services/*`에 둔다.
- 서비스보다 먼저 설치되어야 하는 cluster 기반은 `platform/*`에 둔다.
- DB, Kafka, storage는 서비스 chart에 직접 넣지 않고 `platform/data` 또는 별도 chart로 분리한다.
- `archive/k8s-kustomize`는 참조용이며 Argo CD나 Taskfile의 기본 운영 경로로 사용하지 않는다.
