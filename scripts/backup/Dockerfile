# Backup sidecar: pg_dump (matching the postgres:17 server) + age + the AWS CLI.
# Built by the optional `backup` profile in docker-compose.yml.
FROM alpine:3.22
RUN apk add --no-cache postgresql17-client age aws-cli
COPY backup.sh restore.sh loop.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/loop.sh
CMD ["/usr/local/bin/loop.sh"]
