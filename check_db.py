import paramiko

host = "8.134.250.77"
user = "root"
password = "zh2005ZH."
port = 22

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, user, password)

stdin, stdout, stderr = ssh.exec_command("ls -lh /root/model-plunger/apps/api/prisma/dev.db")
print(stdout.read().decode())
ssh.close()
