FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv libgomp1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN python3 -m venv /opt/rembg \
  && /opt/rembg/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/rembg/bin/pip install --no-cache-dir -r requirements.txt

ENV REMBG_PYTHON=/opt/rembg/bin/python
ENV U2NET_HOME=/opt/rembg-models
RUN mkdir -p "$U2NET_HOME" \
  && /opt/rembg/bin/python -c 'from rembg import new_session; new_session("isnet-general-use")'

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "run", "start"]
