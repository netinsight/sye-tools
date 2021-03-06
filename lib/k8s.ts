import { consoleLog, execSync } from './common'
import * as path from 'path'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

export function installTillerRbac(kubeconfig: string) {
    const rbacSpec = `---
#
# Service account for Helm Tiller usage
#
apiVersion: v1
kind: ServiceAccount
metadata:
  name: tiller
  namespace: kube-system
---
#
# Helm needs to be cluster admin in order to work
#
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: tiller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: tiller
    namespace: kube-system`
    consoleLog(`Installing/updating Tiller service account and role binding:`)
    execSync(`kubectl --kubeconfig ${kubeconfig} apply -f -`, {
        input: rbacSpec,
    })
    consoleLog('  Done.')
}

export function installTiller(kubeconfig: string) {
    try {
        consoleLog('Installing Tiller (Helm):')
        execSync(`kubectl --kubeconfig ${kubeconfig} --namespace kube-system get deployment.apps/tiller-deploy 2>&1`)
        consoleLog('  Already installed - OK.')
    } catch (ex) {
        consoleLog('  Installing Tiller...')
        execSync(`helm init --kubeconfig ${kubeconfig} --service-account tiller`)
        consoleLog('  Done.')
    }
}

export function waitForTillerStarted(kubeconfig: string) {
    consoleLog('Wait for Tiller to be ready...')
    execSync(
        `kubectl --kubeconfig ${kubeconfig} --namespace kube-system wait pods --for condition=ready -l app=helm,name=tiller --timeout=300s`
    )
    consoleLog('  Tiller is ready.')
}

export function installNginxIngress(kubeconfig: string) {
    consoleLog('Installing/updating NGINX Ingress:')
    execSync(
        `helm upgrade --kubeconfig ${kubeconfig} --install --namespace kube-system --set replicaCount=2 nginx-ingress stable/nginx-ingress`
    )
    consoleLog('  Done.')
}

export function installMetricsServer(kubeconfig: string) {
    consoleLog('Installing/updating Metrics Server:')
    execSync(
        `helm upgrade --kubeconfig ${kubeconfig} --install --namespace kube-system metrics-server stable/metrics-server`
    )
    consoleLog('  Done.')
}

export function installPrometheusOperator(kubeconfig: string) {
    consoleLog('Installing/updating Prometheus Operator:')
    execSync(`helm upgrade --kubeconfig ${kubeconfig} --install --namespace prometheus --wait \
--set commonLabels.prometheus=metrics \
--set prometheusOperator.serviceMonitor.selfMonitor=false \
--set prometheus.enabled=false \
--set alertmanager.enabled=false \
--set grafana.enabled=false \
--set kubeApiServer.enabled=false \
--set kubelet.enabled=false \
--set kubeControllerManager.enabled=false \
--set kubeScheduler.enabled=false \
--set coreDns.enabled=false \
--set kubeDns.enabled=false \
--set kubeEtcd.enabled=false \
--set kubeStateMetrics.enabled=true \
--set nodeExporter.enabled=false \
--version 5.12.3 \
prometheus-operator stable/prometheus-operator`)
    consoleLog('  Done.')
}

export function installPrometheus(kubeconfig: string) {
    consoleLog('Installing/updating Prometheus:')
    const prometheusDir = path.resolve(__dirname, 'prometheus')
    execSync(`kubectl apply --kubeconfig ${kubeconfig} --namespace prometheus -f ${prometheusDir}`)
    consoleLog('  Done.')
}

export function installPrometheusAdapter(kubeconfig: string) {
    consoleLog('Installing/updating Prometheus Adapter:')
    execSync(`helm upgrade --kubeconfig ${kubeconfig} --install --namespace prometheus \
    --set prometheus.url=http://metrics.prometheus.svc \
    --set prometheus.port=9090 \
    --set image.repository=bhavin192/k8s-prometheus-adapter-amd64 \
    --set image.tag=pr110 \
    --version 1.1.0 \
    prometheus-adapter stable/prometheus-adapter`)
    consoleLog('  Done.')
}

export function writeClusterAutoscalerFile(
    valuesFile: string,
    kubeconfig: string,
    cloudProvider: 'aws' | 'azure',
    extraValues?: any
) {
    consoleLog('Preparing Cluster Autoscaler values file:')

    const values = {
        ...extraValues,
        cloudProvider,
        rbac: { create: true },
        serviceMonitor: {
            enabled: true,
            namespace: 'kube-system',
            selector: {
                prometheus: 'metrics',
            },
        },
        extraArgs: {
            'skip-nodes-with-local-storage': 'false',
            'skip-nodes-with-system-pods': 'false',
            'max-empty-bulk-delete': '1',
        },
    }

    if (fs.existsSync(valuesFile)) {
        consoleLog('  Already created - OK.')
    } else {
        fs.writeFileSync(valuesFile, yaml.safeDump(values))
        consoleLog('  Done.')
    }

    consoleLog('Note! Manually install/upgrade cluster-autoscaler with:')
    consoleLog(
        `helm upgrade --kubeconfig ${kubeconfig} --install --namespace kube-system autoscaler stable/cluster-autoscaler -f ${valuesFile}`
    )
}
