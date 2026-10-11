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
    assert "$env:AGENTAUTHTOKEN = Read-Host" in content, "Windows one-liner must use $env:AGENTAUTHTOKEN with Read-Host"
    assert "Remove-Item Env:AGENTAUTHTOKEN" in content, "Windows one-liner must clean up environment variable"
    
    # 3. Linux command uses AGENTAUTHTOKEN and unset
    assert 'AGENTAUTHTOKEN' in content, "Linux command must use AGENTAUTHTOKEN"
    assert 'unset AGENTAUTHTOKEN' in content, "Linux command must unset AGENTAUTHTOKEN"
    
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
