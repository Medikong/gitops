# Istio Sidecar Injection

This directory documents the sidecar injection rollout policy for the
Medikong service namespace.

## Rollout policy

Start with workload-level opt-in before enabling namespace-wide injection.
This keeps the Kong baseline stable while the first Envoy sidecar path is
verified.

Recommended order:

1. `concert-service`
2. `reservation-service`
3. `payment-service`
4. `ticket-service`
5. `notification-service`
6. `auth-service`

After the first two services are verified, namespace-wide injection can be
enabled by adding the `istio-injection=enabled` label to the application
namespace.

## Verification checklist

Use this checklist before moving the Notion task to `Review` or `Done`.

1. Istio control plane is healthy in `istio-system`.
2. Target workload Pod shows `READY 2/2`.
3. Target workload Pod contains the `istio-proxy` container.
4. Kong-routed smoke request still succeeds.
5. Internal service call still succeeds.
6. Kiali shows the target workload in the mesh topology.
7. Prometheus has Istio metrics such as `istio_requests_total`.

## Namespace-wide injection example

Do not apply this until the target application namespace has been confirmed.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <application-namespace>
  labels:
    istio-injection: enabled
```

Existing Pods must be restarted after the label is added.

```bash
kubectl rollout restart deployment -n <application-namespace>
```

## Workload-level injection example

Use this first if the shared Helm chart supports Pod annotations.

```yaml
podAnnotations:
  sidecar.istio.io/inject: "true"
```

This should render under the Deployment Pod template metadata, not the
Deployment metadata.
