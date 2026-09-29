import subprocess
import time
import requests

def verify_prototype():
    print("Starting prototype verification...")
    # This script assumes the server is already running on 8085
    try:
        response = requests.get("http://localhost:8085")
        if response.status_code == 200:
            print("✅ Server is reachable")
        else:
            print(f"❌ Server returned status {response.status_code}")
    except Exception as e:
        print(f"❌ Could not connect to server: {e}")

if __name__ == "__main__":
    verify_prototype()
