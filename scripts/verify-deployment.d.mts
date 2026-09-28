export interface DeploymentVerificationInput { webUrl: string; apiUrl: string; fetchImpl?: typeof fetch; }
export interface DeploymentVerificationResult { web: number; api: number; readiness: number; contentEncoding: string | null; }
export function verifyDeployment(input: DeploymentVerificationInput): Promise<DeploymentVerificationResult>;
