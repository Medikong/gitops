# Kong platform resources

Kong Gateway와 Kong Ingress Controller는 서비스 Helm release보다 먼저 준비하는 platform 레이어다. 서비스별 `Ingress` 객체는 `charts/medikong-service` release가 계속 관리하지만, `Ingress`만 있어서는 로컬 브라우저 접속이 되지 않는다. `kong` `IngressClass`, Kong controller/gateway, 공통 `KongClusterPlugin`, demo `KongConsumer`가 함께 준비되어야 한다.

## Docker Desktop dev

`task dev`는 Docker Desktop local loop에서 다음 순서로 동작한다.

1. Helm/Kustomize render 검증
2. Prometheus stack 배포
3. Medikong namespace 생성
4. `platform/data` DB/Kafka 배포
5. Kong Helm release와 shared gateway resource 배포
6. `service` repo backend image build/push
7. 백엔드 서비스별 Helm release 배포

Kong chart는 `platform/kong/values-local.yaml`을 사용한다. Docker Desktop 클러스터 설정에 따라 proxy Service `EXTERNAL-IP`가 `<pending>`이면 `task dev`는 계속 진행하고 `kubectl -n kong port-forward svc/kong-kong-proxy 8080:80` fallback을 안내한다.

## Local URLs

`task dev SERVICE_REPO=../service DEV_REGISTRY=localhost:5001 DEV_IMAGE_TAG=dev` 후 기본 접속 주소는 다음과 같다.

| 대상 | URL |
| --- | --- |
| Auth API | `http://localhost/auth` |
| Concert API | `http://localhost/concerts` |
| Performance seats API | `http://localhost/performances` |
| Reservation API | `http://localhost/reservations` |
| Payment API | `http://localhost/payments` |
| Ticket API | `http://localhost/tickets` |
| Notification API | `http://localhost/notifications` |

## Smoke

Auth route는 JWT plugin을 붙이지 않는다. 나머지 API route는 `ticketing-jwt`와 `ticketing-identity-headers`를 통해 demo token을 검증하고 `X-User-*` header를 upstream service에 전달한다.

```bash
curl -fsS http://localhost/auth/demo-accounts

TOKEN="$(
  curl -fsS -X POST http://localhost/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"admin@example.com","password":"admin1234"}' \
  | ruby -rjson -e 'puts JSON.parse(STDIN.read).fetch("accessToken")'
)"

curl -fsS http://localhost/concerts -H "Authorization: Bearer ${TOKEN}"
curl -fsS http://localhost/reservations -H "Authorization: Bearer ${TOKEN}"
curl -fsS http://localhost/payments -H "Authorization: Bearer ${TOKEN}"
curl -fsS http://localhost/tickets -H "Authorization: Bearer ${TOKEN}"
curl -fsS http://localhost/notifications -H "Authorization: Bearer ${TOKEN}"
```

## Resource Ownership

| 리소스 | 위치 | 소유 |
| --- | --- | --- |
| Kong Helm values | `platform/kong/values-local.yaml` | platform |
| `IngressClass/kong` | `platform/kong/ingressclass.yaml` | platform |
| `KongClusterPlugin` | `platform/kong/plugins` | platform |
| demo `KongConsumer`/JWT `Secret` | `platform/kong/consumers` | platform |
| 서비스별 `Ingress` | `values/services/*.yaml` + `charts/medikong-service` | service release |

`service` repo는 Dockerfile과 image build/push만 소유한다. Kubernetes/Helm/Kong/Ingress 선언은 이 `gitops` repo가 소유한다.
