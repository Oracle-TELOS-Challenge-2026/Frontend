# Oracle 해커톤 프론트엔드

React + TypeScript + Vite 프로젝트입니다.

## 로컬 실행

Node.js 22.12 이상인 22.x와 pnpm 10을 사용합니다.
로컬 검증 버전은 Node.js 22.19.0, pnpm 10.17.0입니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## 배포 전 확인

```sh
pnpm lint
pnpm build
pnpm preview
```

## Vercel 배포

GitHub에 이 저장소를 푸시한 뒤 Vercel의 Add New → Project에서 가져옵니다.
현재 Git 저장소 루트에 `package.json`이 있으므로 Root Directory는 `.`입니다.

| 설정 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | . |
| Build Command | pnpm build |
| Output Directory | dist |
| Install Command | 자동 감지 유지 (Override 끄기) |
| Node.js Version | 22.x (`package.json`에 지정) |

`pnpm-lock.yaml`을 커밋해 Vercel이 pnpm을 자동 감지하도록 합니다.
현재 앱은 환경변수 없이 배포할 수 있습니다.
API 연결 시 필요한 공개 설정은 Vercel 프로젝트의 Environment Variables에 등록합니다.
`VITE_` 변수는 브라우저에 공개되므로 인증키나 DB 비밀번호를 넣지 않습니다.

공식 문서: [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite),
[패키지 매니저 자동 감지](https://vercel.com/docs/package-managers),
[Vite 환경변수](https://vite.dev/guide/env-and-mode).
