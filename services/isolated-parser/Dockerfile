FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY parser.py /app/parser.py
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin vexonyx && \
    chmod 0555 /app/parser.py && chown -R root:root /app
USER 10001:10001
ENTRYPOINT ["python","/app/parser.py"]
