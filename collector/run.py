import uvicorn
import os
import sys

# Add project_root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))
sys.path.insert(0, project_root)

if __name__ == "__main__":
    uvicorn.run("collector.app.main:app", host="0.0.0.0", port=5000, reload=True)
