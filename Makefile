SHELL := /bin/sh

.DEFAULT_GOAL := help

KUBECTL ?= kubectl
HELM ?= helm
ANSIBLE_PLAYBOOK ?= ansible-playbook
ANSIBLE_INVENTORY ?=
REGISTRY ?= 10.10.10.10:5000
IMAGE_TAG ?=
LOCAL_APPS_KUSTOMIZATION ?= k8s/overlays/local/apps/kustomization.yaml
LOCAL_ALL_OVERLAY ?= k8s/overlays/local/all
AWS_ALL_OVERLAY ?= k8s/overlays/aws/all
SERVICE_CHART ?= charts/medikong-service
VALUES_BASE ?= values/base.yaml
VALUES_LOCAL ?= values/env/local.yaml
VALUES_AWS_DEV ?= values/env/aws-dev.yaml
VALUES_AWS_PROD ?= values/env/aws-prod.yaml
VALUES_PATIENT ?= values/services/patient.yaml
VALUES_PATIENT_AWS_PROD ?= values/overrides/aws-prod/patient.yaml

.PHONY: help validate render-local-all render-aws-all update-local-image-tags \
	apply-local-all status metallb-bootstrap metallb-verify observability-install \
	cluster-bootstrap cluster-verify helm-bootstrap metrics-bootstrap metrics-verify \
	registry-bootstrap registry-verify registry-pull-verify observability-storage-bootstrap \
	helm-lint helm-template-patient-local helm-template-patient-aws-dev helm-template-patient-aws-prod

help:
	@printf '%s\n' 'Medikong GitOps commands'
	@printf '%s\n' ''
	@printf '  %-34s %s\n' 'make validate' 'local/aws Kustomize overlay를 렌더링합니다.'
	@printf '  %-34s %s\n' 'make render-local-all' 'k8s/overlays/local/all 렌더링을 확인합니다.'
	@printf '  %-34s %s\n' 'make render-aws-all' 'k8s/overlays/aws/all 렌더링을 확인합니다.'
	@printf '  %-34s %s\n' 'make helm-lint' '공통 서비스 Helm chart를 lint합니다.'
	@printf '  %-34s %s\n' 'make helm-template-patient-local' 'patient local Helm release를 렌더링합니다.'
	@printf '  %-34s %s\n' 'make helm-template-patient-aws-dev' 'patient aws-dev Helm release를 렌더링합니다.'
	@printf '  %-34s %s\n' 'make helm-template-patient-aws-prod' 'patient aws-prod Helm release를 렌더링합니다.'
	@printf '  %-34s %s\n' 'make update-local-image-tags' 'IMAGE_TAG를 local apps overlay에 반영합니다.'
	@printf '  %-34s %s\n' 'make apply-local-all' '현재 kubeconfig 대상 클러스터에 local/all을 적용합니다.'
	@printf '  %-34s %s\n' 'make status' '앱 namespace 상태를 조회합니다.'
	@printf '  %-34s %s\n' 'make metallb-bootstrap' 'MetalLB를 설치하고 address pool을 적용합니다.'
	@printf '  %-34s %s\n' 'make observability-install' 'Helm 기반 observability stack을 설치합니다.'

validate: render-local-all render-aws-all

render-local-all:
	$(KUBECTL) kustomize $(LOCAL_ALL_OVERLAY) >/dev/null

render-aws-all:
	$(KUBECTL) kustomize $(AWS_ALL_OVERLAY) >/dev/null

helm-lint:
	$(HELM) lint $(SERVICE_CHART)

helm-template-patient-local:
	$(HELM) template patient-local $(SERVICE_CHART) -f $(VALUES_BASE) -f $(VALUES_LOCAL) -f $(VALUES_PATIENT) >/dev/null

helm-template-patient-aws-dev:
	$(HELM) template patient-aws-dev $(SERVICE_CHART) -f $(VALUES_BASE) -f $(VALUES_AWS_DEV) -f $(VALUES_PATIENT) >/dev/null

helm-template-patient-aws-prod:
	$(HELM) template patient-aws-prod $(SERVICE_CHART) -f $(VALUES_BASE) -f $(VALUES_AWS_PROD) -f $(VALUES_PATIENT) -f $(VALUES_PATIENT_AWS_PROD) >/dev/null

update-local-image-tags:
	@if [ -z "$(IMAGE_TAG)" ]; then \
		printf '%s\n' 'IMAGE_TAG is required, for example: make update-local-image-tags IMAGE_TAG=dev-001' >&2; \
		exit 2; \
	fi
	cluster/scripts/update-local-image-tags.sh "$(IMAGE_TAG)" "$(LOCAL_APPS_KUSTOMIZATION)" "$(REGISTRY)"

apply-local-all:
	$(KUBECTL) apply -k $(LOCAL_ALL_OVERLAY)

status:
	cluster/scripts/show-local-k8s-status.sh

metallb-bootstrap:
	cluster/scripts/bootstrap-metallb.sh

metallb-verify:
	cluster/scripts/verify-metallb.sh

observability-install:
	cd cluster/stacks/observability && ./install.sh

cluster-bootstrap:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/bootstrap-cluster.yml

cluster-verify:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/verify-cluster.yml

helm-bootstrap:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/bootstrap-helm.yml

metrics-bootstrap:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/bootstrap-metrics-server.yml

metrics-verify:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/verify-metrics-server.yml

registry-bootstrap:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/bootstrap-registry.yml

registry-verify:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/verify-registry.yml

registry-pull-verify:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/verify-registry-pull.yml

observability-storage-bootstrap:
	$(ANSIBLE_PLAYBOOK) $(if $(ANSIBLE_INVENTORY),-i $(ANSIBLE_INVENTORY),) cluster/ansible/playbooks/bootstrap-observability-storage.yml
