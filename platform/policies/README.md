# Platform policies

Gatekeeper, Falco, namespace 공통 보안 정책처럼 cluster-level 정책은 서비스 Helm release와 분리해 이 영역에서 관리한다.

서비스별 `NetworkPolicy`, `ServiceAccount`, `Role`, `RoleBinding`은 `charts/medikong-service` release가 관리한다.
