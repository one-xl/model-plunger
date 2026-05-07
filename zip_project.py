import os
import zipfile

def zip_dir():
    with zipfile.ZipFile('deploy.zip', 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            if any(x in root for x in ['node_modules', '.git', '.kilo', '.vscode', 'dist']):
                continue
            for file in files:
                if file in ['deploy.zip', 'deploy_fixed.zip']:
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, '.')
                zipf.write(file_path, arcname)
    print("Zipped to deploy.zip")

zip_dir()
