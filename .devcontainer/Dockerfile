# texlive/texlive は full scheme を週次更新している。
# すべての TeX Live パッケージを含むが、documentation/source は標準では含めない。
# 配布物の再現性を優先し、latest を digest で固定して意図的に更新する。
FROM texlive/texlive:latest@sha256:f0bc49733665c09378b8ec0aca40e3263211bd208c9ecb7dfcce4967f234cf49

# textlint 15 系は Node.js 20 以上が必要なため、
# Debian 既定の古い nodejs ではなく公式配布物を入れる。
ARG NODE_VERSION=22.22.1

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
        amd64) node_arch='x64'; node_sha256='9a6bc82f9b491279147219f6a18add1e18424dce90d41d2a5fcd69d4924ba3aa' ;; \
        arm64) node_arch='arm64'; node_sha256='0f3550d58d45e5d3cf7103d9e3f69937f09fe82fb5dd474c66a5d816fa58c9ee' ;; \
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

# textlint と LaTeX 向けプラグイン・日本語ルールをイメージに同梱して、
# コンテナ接続直後からそのまま使えるようにする。
RUN npm install -g \
    textlint@15.5.2 \
    textlint-plugin-latex2e@1.2.1 \
    textlint-rule-preset-ja-spacing@2.4.3 \
    textlint-rule-preset-ja-technical-writing@12.0.2 && \
    npm cache clean --force && \
    textlint --version
