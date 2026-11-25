# EMCOM Dispatch 1.66 — Installation guide (GitHub edition)

Honest remark from the author: contains a lot of vibe coding!

## Requirements
Debian or Ubuntu with systemd, a trusted LAN, Git, sudo, the latest Node.js release (minimum 22.12), npm, Python 3, make, a C++ compiler for better-sqlite3, rsync, curl and CA certificates. Internet access is required for GitHub, dependency installation and online maps/geocoding. No offline map dependencies are required. Port TCP 3000 is used. The application serves HTTP, not HTTPS; restrict access to a trusted network or use a TLS reverse proxy before operational deployment.

## 1. Install dependencies
Run as an administrator with sudo privileges. If sudo is not installed, a root administrator must first install it (`apt update && apt install sudo`) and grant the installation administrator appropriate sudo access. Do not grant sudo access to the service account.

```sh
sudo apt update
sudo apt install -y git sudo ca-certificates curl build-essential python3 rsync
```

Install the latest Node.js release with npm system-wide before continuing. Instructions for installing Node.js are outside the scope of this guide; consult https://nodejs.org/. Verify that the selected release is compatible with the application dependencies, especially better-sqlite3.

```sh
node --version
npm --version
command -v node
/usr/bin/node --version
```

The supplied systemd unit uses `/usr/bin/node`. If Node.js is installed elsewhere, adjust ExecStart to the absolute path of the system-wide executable accessible to the service account (not a private home directory).

## 2. Create a dedicated non-login account
```sh
sudo useradd --system --user-group --home-dir /opt/emcom_dispatch --no-create-home --shell /usr/sbin/nologin emcom_dispatch
sudo passwd -l emcom_dispatch
getent passwd emcom_dispatch
```
Run useradd only once. The account has no interactive shell and a locked password. Do not grant sudo privileges or SSH keys. Administrators can still execute individual commands as the service account via sudo; this is intentional.

## 3. Install application files
For a new installation, clone the GitHub repository as your normal administrator account. If `~/emcom_dispatch` already exists as a Git checkout, do not clone over it; use the update procedure in step 7. If it is not a Git checkout, move it aside before cloning.

```sh
cd ~
git clone https://github.com/pe2kmv/emcom_dispatch.git
cd ~/emcom_dispatch
npm install --include=dev
npm run build
```

Deploy the complete built application tree, including hidden files and directories, generated `dist/` and `node_modules/`. The trailing slash on the source directory is important. Exclude Git metadata and operational data deliberately; never copy development databases or logs into a fresh installation.

```sh
sudo install -d -o root -g emcom_dispatch -m 0750 /opt/emcom_dispatch
sudo rsync -a --exclude='/.git/' --exclude='/data/' --exclude='/log/' ~/emcom_dispatch/ /opt/emcom_dispatch/
sudo chown -R root:emcom_dispatch /opt/emcom_dispatch
sudo chmod -R u=rwX,g=rX,o= /opt/emcom_dispatch
sudo install -d -o emcom_dispatch -g emcom_dispatch -m 0700 /opt/emcom_dispatch/data /opt/emcom_dispatch/log
sudo chown -R emcom_dispatch:emcom_dispatch /opt/emcom_dispatch/data /opt/emcom_dispatch/log
sudo chmod -R u=rwX,go= /opt/emcom_dispatch/data /opt/emcom_dispatch/log
```

Do not use `cp ~/emcom_dispatch/*`: shell wildcards omit hidden entries. Verify the deployment before starting the service:

```sh
sudo rsync -rcn --itemize-changes --exclude='/.git/' --exclude='/data/' --exclude='/log/' ~/emcom_dispatch/ /opt/emcom_dispatch/
sudo -u emcom_dispatch test -r /opt/emcom_dispatch/server.js
sudo -u emcom_dispatch test -r /opt/emcom_dispatch/dist/index.html
```

The rsync dry run should report no missing or changed source files. Ownership and permission differences are intentionally not compared. The code and dependencies are read-only to the service account; only data and log directories are writable. Build as an ordinary user, not root. Keep the generated dist directory. For an existing installation use step 7 instead.

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
# Verify write access as the actual service account before starting.
sudo -u emcom_dispatch sh -ec 'for d in /opt/emcom_dispatch/data /opt/emcom_dispatch/log; do test -r "$d" && test -w "$d" && test -x "$d"; f=$(mktemp "$d/.permission-test.XXXXXX"); rm "$f"; done; for f in /opt/emcom_dispatch/data/cad.sqlite /opt/emcom_dispatch/data/cad.sqlite-wal /opt/emcom_dispatch/data/cad.sqlite-shm /opt/emcom_dispatch/data/cad.sqlite-journal; do if test -e "$f"; then test -r "$f" && test -w "$f"; fi; done'
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
Update the Git checkout and build as your normal administrator account. Commit or otherwise preserve local changes before pulling. Review the release notes and confirm the intended version before deployment.

```sh
cd ~/emcom_dispatch
git status
git pull --ff-only
npm install --include=dev
npm run build
```

Stop the service and back up the complete deployed application, data and log directories before copying the new release. The backup contains sensitive data and must remain private.

```sh
sudo systemctl stop emcom_dispatch
sudo install -d -m 0700 /var/backups/emcom_dispatch
sudo cp -a /opt/emcom_dispatch "/var/backups/emcom_dispatch/$(date +%Y%m%d-%H%M%S)"
sudo rsync -a --exclude='/.git/' --exclude='/data/' --exclude='/log/' ~/emcom_dispatch/ /opt/emcom_dispatch/
```

After copying, restore ownership and permissions using the following commands while the service is stopped:

```sh
sudo chown -R root:emcom_dispatch /opt/emcom_dispatch
sudo chmod -R u=rwX,g=rX,o= /opt/emcom_dispatch
sudo chown -R emcom_dispatch:emcom_dispatch /opt/emcom_dispatch/data /opt/emcom_dispatch/log
sudo chmod -R u=rwX,go= /opt/emcom_dispatch/data /opt/emcom_dispatch/log
```

Run the write-access verification in step 5 before restarting.

Repeat the service-file installation and daemon-reload if changed, then start the service (`sudo systemctl start emcom_dispatch`). Verify the browser, login, incident creation and logs. Never run two instances against the same database. Keep backups private; they contain operational and personal data. To roll back a schema-changing update, restore the matching application and database backup together.

## 8. Troubleshooting
- `journalctl -u emcom_dispatch -n 100 --no-pager` shows startup errors.
- If port 3000 is occupied, stop the previous CAD process before starting the service.
- If native SQLite compilation fails, verify Node.js, Python and build-essential, then reinstall dependencies in staging.
- If SQLite or log writes fail, check ownership and permissions of data and log, including their existing files.
- Map and geocoding services require internet access. DAPNET requires access to its configured endpoint.

Legacy release notes are retained in CHANGELOG-legacy-nl.md for reference only; this guide supersedes old installation instructions.

## Fresh installation defaults

English is the default language when no system settings exist. Only the Superuser account (password 4321, access level 0) is created; all other application tables start empty. Configure classifications, priorities and unit statuses before creating incidents or units. System and map defaults are provided without inserting configuration rows. Existing installations retain their configured data and language. Change the initial password immediately.

### SQLite error: attempt to write a readonly database (SQLITE_READONLY)

The database is `/opt/emcom_dispatch/data/cad.sqlite`. SQLite also needs write access to its containing directory and any existing WAL, SHM and journal files. Running the application as root, or copying a database as root, can leave these files inaccessible to the service account. Stop the service and any manually started instance before repairing permissions. Do not delete SQLite sidecar files.

```sh
sudo systemctl stop emcom_dispatch
sudo chown root:emcom_dispatch /opt/emcom_dispatch
sudo chmod 0750 /opt/emcom_dispatch
sudo chown -R emcom_dispatch:emcom_dispatch /opt/emcom_dispatch/data /opt/emcom_dispatch/log
sudo chmod -R u=rwX,go= /opt/emcom_dispatch/data /opt/emcom_dispatch/log
```

Run the write-access verification in step 5. If it succeeds, restart:

```sh
sudo systemctl start emcom_dispatch
sudo systemctl status emcom_dispatch
sudo journalctl -u emcom_dispatch -n 50 --no-pager
```

If the error persists, inspect the path permissions and mount options:

```sh
sudo namei -l /opt/emcom_dispatch/data/cad.sqlite
sudo ls -la /opt/emcom_dispatch/data
findmnt -T /opt/emcom_dispatch/data
sudo systemctl cat emcom_dispatch
```

Check for a read-only filesystem, ACLs or other access restrictions. The service must allow writes to both data and log via ReadWritePaths. Never solve this by running Node.js as root or using chmod 777. If testing manually, stop the service first and run `sudo -u emcom_dispatch /usr/bin/node /opt/emcom_dispatch/server.js`; stop the manual process before restarting systemd.
