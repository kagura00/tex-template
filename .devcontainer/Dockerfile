# TeX Live 2026 の検証済みスナップショット。OS は Debian stable で別管理する。
FROM texlive/texlive:latest@sha256:07e8062637249c4f780ca59f42cc2ed592bc2dc1db4320769406aee3f98aa70e AS texlive-source
# Java 補助ツールは対象外。古い bundled ライブラリを最終イメージへ持ち込まない。
RUN find /usr/local/texlive/2026 -type f -name '*.jar' -delete

FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
ARG NODE_VERSION=24.22.2
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
COPY --from=texlive-source /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# 最初の APT 実行から HTTPS のみ・再試行なし。stable/security の更新を適用する。
RUN printf '%s\n' 'Acquire::https::CaInfo "/etc/ssl/certs/ca-certificates.crt";' 'Acquire::Retries "0";' 'APT::Update::Error-Mode "any";' >/etc/apt/apt.conf.d/99secure-bootstrap && \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get -o Acquire::Retries=0 update && \
    DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=0 upgrade -y && \
    DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=0 install -y --no-install-recommends \
      ca-certificates curl git poppler-utils ripgrep sudo xz-utils \
      make fontconfig perl ghostscript libsm6 libncurses6 \
      libgetopt-long-descriptive-perl libdigest-perl-md5-perl \
      libunicode-linebreak-perl libfile-homedir-perl libyaml-tiny-perl \
      libpdf-api2-perl python3 python3-pygments python-is-python3 && \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' apt)" ge 3.0.4 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=texlive-source /usr/local/texlive/2026 /usr/local/texlive/2026
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) tex_arch=x86_64-linux ;; \
      arm64) tex_arch=aarch64-linux ;; \
      *) exit 1 ;; \
    esac; \
    ln -s "/usr/local/texlive/2026/bin/${tex_arch}" /opt/texlive-bin; \
    useradd -m -s /bin/bash texlive; \
    mkdir -p /home/texlive/.vscode-server/extensions /home/texlive/.vscode-server/data; \
    chown -R texlive:texlive /home/texlive/.vscode-server
ENV PATH="/opt/texlive-bin:/opt/textlint/node_modules/.bin:${PATH}"

COPY prepare-tex-workspace.sh /usr/local/sbin/prepare-tex-workspace
RUN chmod 0755 /usr/local/sbin/prepare-tex-workspace && \
    printf '%s\n' 'texlive ALL=(root) NOPASSWD: /usr/local/sbin/prepare-tex-workspace' >/etc/sudoers.d/texlive && \
    chmod 0440 /etc/sudoers.d/texlive

RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
      amd64) node_arch=x64; node_sha256=48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75 ;; \
      arm64) node_arch=arm64; node_sha256=eb187837a2230d4047161ac0be008584e16b46f726e9c9490ee35dc6b17d9ba8 ;; \
      *) exit 1 ;; \
    esac; \
    curl --proto '=https' --tlsv1.2 --fail --show-error --location --remote-name "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    echo "${node_sha256}  node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner; \
    rm "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    node --version; npm --version; lualatex --version; biber --version; latexindent --version

COPY package.json package-lock.json /opt/textlint/
ARG NPM_VERSION=12.2.2
# npm の bundled glob/minimatch も、lock 済みの修正版へ共有させる。
RUN npm ci --prefix /opt/textlint --omit=dev --ignore-scripts && \
    npm install --global --ignore-scripts "npm@${NPM_VERSION}" && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/glob /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    ln -s /opt/textlint/node_modules/glob /usr/local/lib/node_modules/npm/node_modules/glob && \
    ln -s /opt/textlint/node_modules/minimatch /usr/local/lib/node_modules/npm/node_modules/minimatch && \
    npm --version && textlint --version && \
    tlmgr path add && \
    ln -s /opt/textlint/node_modules/.bin/textlint /usr/local/bin/textlint
WORKDIR /workspaces
