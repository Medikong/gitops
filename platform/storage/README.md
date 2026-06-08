# Storage platform resources

`platform/storage`는 서비스 Helm release보다 먼저 필요한 cluster-level storage 전제를 관리한다.

## aws-dev

aws-dev의 관측성 저장소는 AWS EBS CSI driver가 제공하는 동적 PVC를 사용한다. 이 경로에서 관리하는 StorageClass는 `medikong-aws-gp3`이며, Loki/Tempo/Grafana/Prometheus values는 이 이름을 명시해 클러스터 default StorageClass에 의존하지 않는다.

EBS CSI driver 자체는 `argo/applications/aws-dev/platform/aws-ebs-csi-driver.yaml`의 Helm Application이 먼저 배포한다. Helm chart의 기본 StorageClass 생성은 끄고, `platform/storage/storageclass-aws-gp3.yaml`이 StorageClass를 소유한다.

정적 `hostPath` PV는 aws-dev 운영 경로에서 사용하지 않는다. `cluster/stacks/observability`의 local PV 설정은 reference 경로이며, 현재 GitOps 운영 판단 기준은 `platform/storage`, `platform/observability/<component>`, `platform/monitoring`이다.

## 전제

`medikong-aws-gp3` StorageClass는 EBS CSI provisioner(`ebs.csi.aws.com`)를 호출한다. Terraform/EC2 노드에는 EBS CSI driver가 EBS volume을 만들 수 있는 IAM 권한과 IMDS 접근 조건이 먼저 준비되어 있어야 한다.

StorageClass 정책은 다음 기준을 따른다.

```text
provisioner: ebs.csi.aws.com
volume type: gp3
binding: WaitForFirstConsumer
reclaim: Retain
expansion: enabled
encryption: enabled
```
