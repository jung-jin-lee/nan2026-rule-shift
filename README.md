# RULESHIFT

> 룰이 바뀌는 순간, 당신의 판이 된다.

NAN 2026 사전 과제용 브라우저 아케이드 프로토타입입니다. 플레이어는 해금한 스테이지 하나를 선택해 60초 동안 오브를 모으고 드론을 피하며, 8초마다 바뀌는 규칙에 적응해야 합니다. 목표 점수를 넘기면 다음 스테이지가 열립니다.

## 바로 플레이

[브라우저에서 RULESHIFT 실행](https://jung-jin-lee.github.io/nan2026-rule-shift/)

## 실행

```bash
npm run check
npm start
```

브라우저에서 `http://localhost:4173`을 엽니다. GitHub Pages에 저장소 루트를 배포하면 별도 설치 없이 실행할 수 있습니다.

## 조작

- `WASD` / 방향키: 이동
- `SPACE`: 대시
- `P`: 일시정지
- 모바일: 화면 방향키와 DASH 버튼
- 화면 하단 SOUND 버튼: 효과음 켜기/끄기

## 현재 구현 범위

- 독립된 4개 스테이지(SYNC → PRESSURE → OVERLOAD → BREAKPOINT): 선택한 하나의 난이도로 60초 전체를 플레이
- 스테이지별 드론 수·속도·충돌 페널티·오브 수·점수 배율과 목표 점수(2200 → 9000)
- DIRECT PURSUIT·PATH PREDICTION·PINCER FORMATION·ADAPTIVE HUNT의 역할 기반 드론 AI와 목표 진행선/LOCKED·LOST 피드백
- 목표 달성 시 다음 스테이지 해금, 스테이지별 최고 점수와 해금 단계의 안전한 브라우저 저장
- 런 시작 시 선택 스테이지·목표를 알리는 짧은 배너와 화면 피드백
- 규칙 카드 셔플과 카테고리 연속 방지
- 오브 수집, 콤보, 점수, 드론 충돌
- 룰별 이동·점수·적·아레나 변화
- 숫자 카운트다운, 대시 쿨다운, 점수 팝업 피드백
- 합성 효과음과 음소거 설정
- 모바일 터치 이동·대시와 320px 반응형 지원
- 브라우저에 글로벌 최고 점수와 스테이지 진행 상태 저장
- 브라우저 즉시 실행, 외부 API 및 외부 에셋 없음

## 제출 문서

- [게임 설계서](docs/01-game-design.md)
- [AI 활용 기술 문서](docs/02-ai-usage.md)
- [NAN 제출 체크리스트](docs/03-submission-checklist.md)
- [플레이테스트 로그](docs/04-playtest-log.md)
