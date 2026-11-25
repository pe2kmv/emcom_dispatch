# EMCOM Dispatch 1.66 — Installation guide

## Requirements
Debian or Ubuntu with systemd, a trusted LAN, Node.js 22.12 or newer (22 LTS or newer supported LTS), npm, Python 3, make and a C++ compiler for better-sqlite3. Internet access is required for dependency installation and online maps/geocoding. No offline map dependencies are required. Port TCP 3000 is used. The application serves HTTP, not HTTPS; restrict access to a trusted network or use a TLS reverse proxy before operational deployment.

## 1. Install dependencies
Run as an administrator with sudo. Install Node.js from a trusted distribution repository or approved Node.js package source. The following example uses the NodeSource 22 repository; review the downloaded setup script before running it as root.

```sh
sudo apt update
sudo apt install -y ca-certificates curl unzip build-essential python3 rsync
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/emcom-node-setup.sh
less /tmp/emcom-node-setup.sh
sudo bash /tmp/emcom-node-setup.sh
sudo apt install -y nodejs
node --version
npm --version
/usr/bin/node --version
```

Ensure `/usr/bin/node` is at least 22.12. If installed elsewhere, adjust ExecStart in the service file to the absolute path of the system-wide binary (not a private home directory).

## 2. Create a dedicated non-login account
```sh
sudo useradd --system --user-group --home-dir /opt/emcom_dispatch --no-create-home --shell /usr/sbin/nologin emcom_dispatch
sudo passwd -l emcom_dispatch
getent passwd emcom_dispatch
```
Run useradd only once. The account has no interactive shell and a locked password. Do not grant sudo privileges or SSH keys. Administrators can still execute individual commands as the service account via sudo; this is intentional.

## 3. Install application files
For a new installation, from the directory containing the release ZIP, as your normal administrator account (for an existing installation see step 7):
```sh
stage=$(mktemp -d)
unzip cad-vue-v1.66.zip -d "$stage"
cd "$stage/cad-vue"
npm install --include=dev
npm run build
sudo install -d -o root -g emcom_dispatch -m 0750 /opt/emcom_dispatch
sudo rsync -a --exclude=data/ --exclude=log/ ./ /opt/emcom_dispatch/
sudo chown -R root:emcom_dispatch /opt/emcom_dispatch
sudo chmod -R u=rwX,g=rX,o= /opt/emcom_dispatch
sudo install -d -o emcom_dispatch -g emcom_dispatch -m 0700 /opt/emcom_dispatch/data /opt/emcom_dispatch/log
```
The code and dependencies are read-only to the service account; only data and log directories are writable. The application resolves its files relative to server.js, so no working-directory-dependent paths need migration. Build as an ordinary user, not root. Keep the generated dist directory.

## 4. Migrate an existing installation (skip for new installations)
Stop the old process or service before copying data. For example, if the old unit is cad.service:
```sh
sudo systemctl disable --now cad.service
```
If started manually, stop that process instead. Back up the entire old data and log directories while stopped, including SQLite WAL/SHM files if present. Replace the example source path with your actual old installation path. Do not overwrite a newer destination database.
```sh
OLD=/home/your-admin/cad-vue
sudo rsync -a "$OLD/data/" /opt/emcom_dispatch/data/
# Run only if the old log directory exists:
sudo rsync -a "$OLD/log/" /opt/emcom_dispatch/log/
sudo chown -R emcom_dispatch:emcom_dispatch /opt/emcom_dispatch/data /opt/emcom_dispatch/log
sudo chmod -R u=rwX,go= /opt/emcom_dispatch/data /opt/emcom_dispatch/log
```
The existing organisation and language are preserved. The new title column is migrated automatically with EMCOM Dispatch as its default.

## 5. Install and start systemd service
```sh
sudo install -m 0644 /opt/emcom_dispatch/emcom_dispatch.service /etc/systemd/system/emcom_dispatch.service
sudo systemctl daemon-reload
sudo systemctl enable --now emcom_dispatch.service
sudo systemctl status emcom_dispatch.service
sudo journalctl -u emcom_dispatch.service -n 50 --no-pager
curl -f http://127.0.0.1:3000/api/taal
```
Open http://SERVER-IP:3000 from a permitted LAN workstation. On a fresh database the initial application login is Superuser / 4321. Change that password immediately before allowing other users access. Existing databases retain their credentials. In Administration > System (Beheer > Systeem), set Application title, Organisation and Language. The application title appears in the browser tab and application branding; organisation remains the main header.

## 6. Service management
```sh
sudo systemctl stop emcom_dispatch
sudo systemctl start emcom_dispatch
sudo systemctl restart emcom_dispatch
sudo systemctl status emcom_dispatch
sudo journalctl -u emcom_dispatch -f
```
The service starts at boot, restarts on failure and runs without root privileges. Systemd restricts filesystem writes to data and log (and private temporary storage). Check permissions with `sudo -u emcom_dispatch test -w /opt/emcom_dispatch/data` and the equivalent for log. Do not use chmod 777.

## 7. Future updates
Build the new release in a separate staging directory as in step 3. Stop the service, make a consistent backup of data and log, and copy the built release with rsync excluding data/ and log/. After copying, restore ownership and permissions using the following commands while the service is stopped:

```sh
sudo chown -R root:emcom_dispatch /opt/emcom_dispatch
sudo chmod -R u=rwX,g=rX,o= /opt/emcom_dispatch
sudo chown -R emcom_dispatch:emcom_dispatch /opt/emcom_dispatch/data /opt/emcom_dispatch/log
sudo chmod -R u=rwX,go= /opt/emcom_dispatch/data /opt/emcom_dispatch/log
```

 Repeat the service-file installation and daemon-reload if changed, then start the service. Verify the browser, login, incident creation and logs. Never run two instances against the same database. Keep backups private; they contain operational and personal data. To roll back a schema-changing update, restore the matching application and database backup together.

## 8. Troubleshooting
- `journalctl -u emcom_dispatch -n 100 --no-pager` shows startup errors.
- If port 3000 is occupied, stop the previous CAD process before starting the service.
- If native SQLite compilation fails, verify Node.js, Python and build-essential, then reinstall dependencies in staging.
- If SQLite or log writes fail, check ownership and permissions of data and log, including their existing files.
- Map and geocoding services require internet access. DAPNET requires access to its configured endpoint.

Legacy release notes are retained in CHANGELOG-legacy-nl.md for reference only; this guide supersedes old installation instructions.

## Fresh installation defaults

English is the default language when no system settings exist. Only the Superuser account (password 4321, access level 0) is created; all other application tables start empty. Configure classifications, priorities and unit statuses before creating incidents or units. System and map defaults are provided without inserting configuration rows. Existing installations retain their configured data and language. Change the initial password immediately.
