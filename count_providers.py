import paramiko

host = "8.134.250.77"
user = "root"
password = "zh2005ZH."
port = 22

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, user, password)

cmd = 'sqlite3 /root/model-plunger/apps/api/prisma/dev.db "SELECT COUNT(*) FROM Provider;"'
stdin, stdout, stderr = ssh.exec_command(cmd)
print("COUNT:", stdout.read().decode())
print("ERR:", stderr.read().decode())
ssh.close()
