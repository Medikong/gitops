# Platform resources

`platform/`은 서비스 Helm release보다 먼저 준비되어야 하는 공통 Kubernetes 기반을 둔다.

| 영역 | 위치 | 현재 상태 |
| --- | --- | --- |
| Namespace | `platform/namespaces` | 운영 경로 |
| Kong Gateway | `platform/kong` | `archive/k8s-kustomize/kong`에서 이식 필요 |
| Observability | `platform/observability` | `cluster/stacks/observability`와 함께 이식 필요 |
| Policy | `platform/policies` | cluster-level 정책 추가 예정 |
| Data | `platform/data` | DB/Kafka 초기 dev 리소스 이식 필요 |

서비스별 `Deployment`, `Service`, `Ingress`, `ServiceAccount`, `Role`, `RoleBinding`, `NetworkPolicy`, `PDB`, `HPA`, `ServiceMonitor`는 `charts/medikong-service`와 `values/services/*`에서 관리한다.
