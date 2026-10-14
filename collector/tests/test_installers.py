import os
import re
import pytest
from httpx import AsyncClient

ARTIFACTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../artifacts"))
FRONTEND_MODAL = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/components/ui/AddEndpointModal.tsx"))

def test_windows_installer_token_handling():
    ps1_path = os.path.join(ARTIFACTS_DIR, "install-agent.ps1")
    assert os.path.exists(ps1_path), "install-agent.ps1 must exist"
    
    with open(ps1_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Checks $env:AGENTAUTHTOKEN first
    assert "$env:AGENTAUTHTOKEN" in content, "Must check $env:AGENTAUTHTOKEN"
    
    # 2. Cleans up environment variable on exit/finally
    assert "Cleanup-TokenEnvironment" in content, "Must define Cleanup-TokenEnvironment helper"
    assert "Remove-Item Env:AGENTAUTHTOKEN" in content, "Must remove AGENTAUTHTOKEN from environment"
    assert "finally {" in content, "Must contain a finally block for reliable token cleanup"
    
    # 3. Secure interactive fallback with hidden input
    assert "Read-Host" in content, "Must support Read-Host interactive input"
    assert "-AsSecureString" in content, "Must use -AsSecureString for interactive token masking"
    
    # 4. Token validation
    assert "Enrollment token cannot be empty" in content, "Must validate nonempty token"
    
    # 5. Service name and config
    assert "SOCMonitorAgent" in content, "Must use correct service name SOCMonitorAgent"

    # 6. Auto-download fallback and SHA-256 integrity verification
    assert "ExpectedPackageSha256" in content, "Must declare expected SHA-256 package hash"
    assert "C212C37E482276871A1F4A1EA51EAB237535CE62C98AB5E8D997A3628C407C66" in content, "Must verify against official release hash"
    assert "Get-FileHash" in content, "Must compute actual hash via Get-FileHash"
    assert "Package integrity verification failed" in content, "Must reject hash mismatch"
    assert "Expand-Archive" in content, "Must extract package archive"

    # 7. Safe temporary directory and file cleanup in finally block
    assert "TempPackageZip" in content, "Must track temporary package ZIP"
    assert "TempExtractDir" in content, "Must track temporary extraction directory"
    assert "Remove-Item -Path $script:TempPackageZip" in content, "Must clean up temporary zip in finally"
    assert "Remove-Item -Path $script:TempExtractDir" in content, "Must clean up temporary extraction dir in finally"

def test_linux_installer_token_handling():
    sh_path = os.path.join(ARTIFACTS_DIR, "install-agent.sh")
    assert os.path.exists(sh_path), "install-agent.sh must exist"
    
    with open(sh_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Cleanup trap to wipe environment variable
    assert "trap cleanup EXIT INT TERM" in content, "Must register exit cleanup trap"
    assert "unset AGENTAUTHTOKEN" in content, "Must unset AGENTAUTHTOKEN"
    assert "unset AUTH_TOKEN" in content, "Must unset AUTH_TOKEN"
    
    # 2. Checks AGENTAUTHTOKEN
    assert 'AUTH_TOKEN="${AGENTAUTHTOKEN:-}"' in content, "Must initialize token from AGENTAUTHTOKEN"
    
    # 3. Argument parsing for --host, --port, --token
    assert "--host" in content, "Must parse --host flag"
    assert "--port" in content, "Must parse --port flag"
    assert "--token" in content, "Must parse --token flag"
    
    # 4. Secure interactive fallback with hidden input
    assert "read -rsp" in content, "Must use read -rsp for secure hidden token input"
    
    # 5. Service name and config
    assert "soc-agent.service" in content, "Must use soc-agent.service"
    assert "soc-agent" in content, "Must use soc-agent user/group"

def test_add_endpoint_modal_width_and_commands():
    assert os.path.exists(FRONTEND_MODAL), "AddEndpointModal.tsx must exist"
    
    with open(FRONTEND_MODAL, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Viewport width target: 75% on desktop
    assert "add-endpoint-modal-dialog" in content, "Modal must use add-endpoint-modal-dialog class"
    assert "75vw" in content, "Modal must target 75% viewport width on desktop (75vw)"
    assert "max-w-[1400px]" in content, "Modal must cap at 1400px"
    assert "max-h-[90vh]" in content, "Modal must fit viewport height with internal scroll"
    
    # 2. Windows command uses $env:AGENTAUTHTOKEN and finally block cleanup
    assert '$env:AGENTAUTHTOKEN = "${code}"' in content, "Windows one-liner must inject current enrollment token into $env:AGENTAUTHTOKEN"
    assert "Remove-Item Env:AGENTAUTHTOKEN" in content, "Windows one-liner must clean up environment variable"
    assert "Read-Host" not in content, "Must not prompt user with Read-Host"
    
    # 3. Linux command uses AGENTAUTHTOKEN and does not prompt
    assert 'AGENTAUTHTOKEN="${code}"' in content, "Linux command must inject current enrollment token into AGENTAUTHTOKEN"
    assert "read -rsp" not in content, "Linux command must not prompt user with read -rsp"
    
    # 4. WSL scope distinction documented
    assert "Native Windows Host" in content, "WSL tab must document Native Windows Host monitoring"
    assert "Native Kali / Linux VM" in content, "WSL tab must document Native Linux VM monitoring"
    assert "does not monitor the host Windows OS" in content, "Must clarify WSL does not monitor host Windows"

@pytest.mark.asyncio
async def test_download_installer_endpoints(client: AsyncClient):
    # Test Windows installer download
    resp_ps1 = await client.get("/api/v1/agents/download/install-agent.ps1")
    assert resp_ps1.status_code == 200
    assert b"SOCMonitorAgent" in resp_ps1.content
    assert b"AGENTAUTHTOKEN" in resp_ps1.content

    # Test Linux installer download
    resp_sh = await client.get("/api/v1/agents/download/install-agent.sh")
    assert resp_sh.status_code == 200
    assert b"soc-agent" in resp_sh.content
    assert b"AGENTAUTHTOKEN" in resp_sh.content
