#!/bin/bash
set -euo pipefail

if [ -z ${2+x} ]; then
  echo "Usage: $0 <comma-separated list of database servers> <backup location on server>"
  exit 3
fi

comma_separated_server_list=$1
backups_path_on_server=$2

timestamp=`date +'%Y%m%d%H%M%S'`
ephemeral_disk_mount_point=/mnt
copy_target=${ephemeral_disk_mount_point}/database-backup/${timestamp}

SSH_KEY=~/.ssh/id_deploy
SSH_USER=postgres

for server in ${comma_separated_server_list//,/ }
do
  server_copy_target=${copy_target}-${server}
  mkdir -p ${server_copy_target}
  copy_command="scp -Cpr -i ${SSH_KEY} ${SSH_USER}@${server}:${backups_path_on_server} ${server_copy_target}"
  echo "Running $copy_command"
  time eval ${copy_command}
  echo "Got: `du -hsx ${server_copy_target}`"
done
