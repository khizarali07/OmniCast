import requests
import json

try:
    res = requests.get("http://localhost:8000/docs")
    print(f"Docs status: {res.status_code}")
    
    # Try a simple OPTIONS request to see if it responds
    res = requests.options("http://localhost:8000/api/v1/voices/test")
    print(f"OPTIONS /api/v1/voices/test: {res.status_code}")
    print(f"Allow: {res.headers.get('Allow')}")
    
    res = requests.options("http://localhost:8000/api/v1/profile")
    print(f"OPTIONS /api/v1/profile: {res.status_code}")
except Exception as e:
    print(f"Error: {e}")
