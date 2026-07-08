# shake-cat-page 🐱

[**Shake Cat**](https://github.com/jungrok5/shake-cat) 웹사이트의 GitHub Pages 배포 저장소입니다.

모바일 기기를 흔든 횟수를 실시간으로 보여주는 웹사이트예요.

## 🌐 라이브 사이트

배포 후 아래 주소에서 확인할 수 있습니다:

**https://jungrok5.github.io/shake-cat-page/**

> 모바일 기기에서 열어 `시작하기`를 누른 뒤 흔들어 보세요! (iOS는 권한 허용 필요)

## ⚙️ 배포 방법

1. 이 저장소의 **Settings → Pages** 로 이동합니다.
2. **Build and deployment → Source** 를 `GitHub Actions` 로 설정합니다.
3. `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 워크플로가 자동으로 사이트를 배포합니다.

## 📂 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 페이지 구조 |
| `style.css` | 스타일 / 애니메이션 |
| `shake.js` | 흔들기 감지 & 카운터 로직 |
| `.github/workflows/deploy.yml` | GitHub Pages 자동 배포 워크플로 |

소스 코드는 [`shake-cat`](https://github.com/jungrok5/shake-cat) 저장소에서 관리됩니다.
