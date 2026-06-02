# Observability platform resources

Loki, Alloy, Tempo 같은 공통 운영 add-on은 서비스 Helm release와 lifecycle이 다르므로 이 영역에서 관리한다.

Prometheus 기본 스택의 GitOps 운영 경로는 `platform/monitoring`이다. 서비스별 `ServiceMonitor`는 계속 `charts/medikong-service` release가 관리하고, `cluster/stacks/observability` 구조는 Loki, Alloy, Tempo까지 포함한 수동 설치 reference로 유지한다.

AWS scenario 실험군에서는 `values/scenarios/aws/release.yaml`처럼 서비스별 metrics surface를 먼저 렌더링하고, 실제 공통 stack 설치는 별도 플랫폼 작업으로 검증한다.
