# Platform policies

Gatekeeper, Falco, namespace 공통 보안 정책처럼 cluster-level 정책은 서비스 Helm release와 분리해 이 영역에서 관리한다.

서비스별 `NetworkPolicy`, `ServiceAccount`, `Role`, `RoleBinding`은 `charts/medikong-service` release가 관리한다.

기존 서비스별 NetworkPolicy는 `values/services/*`로 옮겨졌고, messaging/data 영역처럼 서비스 release 경계를 넘는 정책은 `platform/data` 이식 때 별도 정책으로 분리한다.
