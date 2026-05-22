# Observability platform resources

Prometheus, Grafana, Loki, Alloy, Tempo 같은 공통 운영 add-on은 서비스 Helm release와 lifecycle이 다르므로 이 영역에서 관리한다.

서비스별 `ServiceMonitor`는 `charts/medikong-service` release가 관리하고, 공통 stack 설치 값은 기존 `cluster/stacks/observability` 구조를 reference로 유지한다.
