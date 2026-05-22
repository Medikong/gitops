# Kong platform resources

Kong Gateway 설치와 cluster-scoped Kong 정책은 서비스 Helm release보다 먼저 준비하는 플랫폼 영역으로 둔다.

현재 실사용 manifest는 기존 `k8s/kong` 구조를 reference로 유지한다. 서비스별 Ingress는 `charts/medikong-service` release가 관리한다.
