# Private-dev synthetic credentials

The synthetic runner reads `synthetic-traffic-credentials` through `envFrom.secretRef`.

Do not reuse the aws-dev SealedSecret. SealedSecret ciphertext is tied to the target cluster's sealed-secrets public key, so private-dev credentials must be sealed against the private-dev controller certificate.

Regenerate `synthetic-traffic-credentials.sealedsecret.yaml` after rotating the private-dev Kubernetes Secret or the sealed-secrets controller key.

```bash
kubectl -n synthetic get secret synthetic-traffic-credentials -o yaml \
  | kubeseal --controller-namespace kube-system \
      --controller-name sealed-secrets-controller \
      --format yaml \
  > platform/synthetic-credentials-private-dev/synthetic-traffic-credentials.sealedsecret.yaml
```
