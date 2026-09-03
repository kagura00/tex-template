# latest の古い digest は取得不能になることがあるため、TeX Live の年度を
# historic タグで固定する。TeX Live 本体は年度固定だが、OS 更新を取り込むため
# このタグのイメージ自体は定期的に再構築される。
# 更新時は次年度の historic タグ (例: TL2026-historic) の公開を確認して差し替える。
FROM texlive/texlive:TL2025-historic

# textlint 15 系は Node.js 20 以上が必要なため、サポート中の LTS を固定する。
# Debian 既定の古い nodejs ではなく公式配布物を入れる。
ARG NODE_VERSION=24.20.0

# Dockerfile のような非対話スクリプトでは、apt より apt-get の方が出力と挙動が安定する。
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    poppler-utils \
    ripgrep \
    sudo \
    xz-utils && \
    rm -rf /var/lib/apt/lists/*

# Dev Containers は postCreate より前に VS Code Server を展開するため、
# 親ディレクトリはイメージ側で先に remoteUser 所有にしておく。
RUN mkdir -p /home/texlive/.vscode-server/extensions /home/texlive/.vscode-server/data && \
    chown -R texlive:texlive /home/texlive/.vscode-server

RUN echo 'texlive ALL=(root) NOPASSWD:ALL' >/etc/sudoers.d/texlive && \
    chmod 0440 /etc/sudoers.d/texlive

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "${arch}" in \
        amd64) node_arch='x64'; node_sha256='2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2' ;; \
        arm64) node_arch='arm64'; node_sha256='5f4ddab610c1ab2016b3c227cebdbf6d9495161487e4739c7b90090595f465f7' ;; \
        *) echo "unsupported architecture: ${arch}" >&2; exit 1 ;; \
    esac; \
    command -v latexmk; \
    command -v texfot; \
    command -v luaotfload-tool; \
    command -v latexindent; \
    command -v chktex; \
    command -v biber; \
    command -v upmendex; \
    command -v rg; \
    command -v pdftotext; \
    curl --fail --show-error --location --remote-name "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    echo "${node_sha256}  node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner; \
    rm "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    node --version; \
    npm --version

# textlint とルール一式は package-lock.json で推移依存まで固定する。
COPY package.json package-lock.json /opt/textlint/
ENV PATH="/opt/textlint/node_modules/.bin:${PATH}"
RUN npm ci --prefix /opt/textlint --omit=dev --ignore-scripts && \
    ln -s /opt/textlint/node_modules/.bin/textlint /usr/local/bin/textlint && \
    npm cache clean --force && \
    textlint --version
