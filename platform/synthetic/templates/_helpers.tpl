{{- define "synthetic-traffic.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "synthetic-traffic.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- include "synthetic-traffic.name" . -}}
{{- end -}}
{{- end -}}

{{- define "synthetic-traffic.namespace" -}}
{{- default .Release.Namespace .Values.namespace.name -}}
{{- end -}}

{{- define "synthetic-traffic.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "synthetic-traffic.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when serviceAccount.create is false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "synthetic-traffic.labels" -}}
app.kubernetes.io/name: {{ include "synthetic-traffic.name" . | quote }}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/part-of: medikong
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
medikong.io/environment: {{ .Values.environment | quote }}
{{- end -}}

{{- define "synthetic-traffic.image" -}}
{{- $repository := required "image.repository is required" .Values.image.repository -}}
{{- $tag := required "image.tag is required" .Values.image.tag -}}
{{- with .Values.image.registry -}}
{{- printf "%s/%s:%s" (. | trimSuffix "/") $repository $tag -}}
{{- else -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}
{{- end -}}
