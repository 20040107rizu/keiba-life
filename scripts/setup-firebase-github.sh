#!/usr/bin/env bash
set -euo pipefail

project=keiba-life
pool=keiba-github
provider=github
account="keiba-github-deploy@$project.iam.gserviceaccount.com"
repo_id=1468778102
condition="assertion.repository_id == '$repo_id' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '20040107rizu/keiba-life/.github/workflows/firebase-live.yml@refs/heads/main'"

number=$(gcloud projects describe "$project" --format='value(projectNumber)')
[[ "$number" =~ ^[0-9]+$ ]]
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com --project="$project"
if ! gcloud iam service-accounts describe "$account" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create keiba-github-deploy --display-name="Keiba Life GitHub deploy" --project="$project"
fi

if ! gcloud iam workload-identity-pools describe "$pool" --location=global --project="$project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool" --location=global --display-name="Keiba Life GitHub" --project="$project"
fi

mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id'
if gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" >/dev/null 2>&1; then
  existing=$(gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" --format='value(attributeCondition)')
  [[ "$existing" == "$condition" ]] || { echo '既存のプロバイダーの条件を確認してください。'; exit 1; }
else
  gcloud iam workload-identity-pools providers create-oidc "$provider" --workload-identity-pool="$pool" --location=global --project="$project" \
    --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="$mapping" --attribute-condition="$condition"
fi

for role in roles/firebasehosting.admin roles/firebaserules.admin; do
  gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$account" --role="$role" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$account" --project="$project" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository_id/$repo_id" --quiet >/dev/null
echo 'Firebase連携の設定が完了しました。GitHub Actionsで「Publish to Firebase」を実行できます。'
