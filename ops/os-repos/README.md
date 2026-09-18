# OS package repositories on the production host

The `.repo` files in this directory are byte-for-byte copies of what is
installed in `/etc/yum.repos.d/` on the production host (AlmaLinux 9). They
live outside `/opt/ahantime`, so no deploy touches them; they are kept here
so the configuration and the reasons behind it are not only on one disk.

## Why several `baseurl`s

Each repo lists several mirrors. librepo tries them in order and moves on
when one fails, so a single mirror going bad no longer breaks
`dnf-makecache.service` (and with it the infra-monitor "failed units" alarm)
or security updates.

- **Iranian mirrors first.** International routes from this host are cut
  from time to time; the national ones stay reachable.
- **One international mirror last** as the fallback of last resort.
  `dl.fedoraproject.org` is unreachable from this host, so EPEL's last entry
  is a mirror taken from the Fedora metalink that answered from here.
- **`gpgkey` is a local `file://`** (shipped by `almalinux-release` /
  `epel-release`), so verifying packages never depends on a mirror.
  `gpgcheck=1` stays on everywhere: a mirror can only serve packages signed
  by the AlmaLinux / EPEL keys.

## History

| Date | What happened |
|---|---|
| 2026-07-05 | cloud-init wrote single-mirror files pointing at `repo.abrha.net`. |
| 2026-09-02 | EPEL moved from the Fedora metalink to `mirror.aminidc.com`. |
| 2026-09-17 | `repo.abrha.net` dropped its `/almalinux/9/` path (only `/9.8/` is left). Every metadata refresh 404'd and `dnf-makecache.service` failed; the infra monitor alarmed on 2026-09-18. |
| 2026-09-18 | AlmaLinux repos switched to iranserver, then mobinhost, then `repo.almalinux.org`. It turned out `mirror.aminidc.com` had been frozen at a **2025-10-12** snapshot, so EPEL had received no updates for 11 months without failing anything. EPEL now uses mobinhost, then abrha, then kaist.ac.kr. `infra-monitor.sh` gained the stale-mirror check that would have caught it. The originals are in `/root/yum.repos.d.bak-20260918T103419Z/`. |

## Checking and changing them

```sh
# Freshness of what dnf has cached (the same data infra-monitor reads):
LC_ALL=C dnf -v -C repolist enabled | grep -E 'Repo-id|Repo-updated'

# Probe a candidate mirror before adding it: must be 200 and a recent revision.
curl -s https://MIRROR/almalinux/9/BaseOS/x86_64/os/repodata/repomd.xml | grep -o '<revision>[0-9]*'
```

After editing a file here, copy it to `/etc/yum.repos.d/` on the host, then
run `dnf clean metadata && dnf makecache` and confirm it exits 0.
