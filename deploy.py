import paramiko
import os

host = "8.134.250.77"
user = "root"
password = "zh2005ZH."
remote_path = "/root/model-plunger"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, 22, user, password)

sftp = ssh.open_sftp()
print("Uploading deploy.zip...")
sftp.put("deploy.zip", "deploy.zip")
sftp.close()

commands = [
    "unzip -o deploy.zip -d model-plunger",
    "cd model-plunger && docker compose down",
    "cd model-plunger && docker compose up -d --build"
]

for cmd in commands:
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode())
    print(stderr.read().decode())

ssh.close()
