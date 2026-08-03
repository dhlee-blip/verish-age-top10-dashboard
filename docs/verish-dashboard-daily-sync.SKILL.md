<!--
  이 파일은 문서화 목적의 사본입니다. 실제 자동화는 이 저장소가 아니라
  로컬 Claude Code 설정 폴더의 원본에서 실행됩니다:
  C:\Users\딥다이브\.claude\scheduled-tasks\verish-dashboard-daily-sync\SKILL.md
  원본을 수정하면 이 사본도 함께 갱신해서 커밋해 주세요.
-->

---
name: verish-dashboard-daily-sync
description: Verish 연령대별 TOP10 대시보드: 구글 시트 최신 데이터를 읽어 GitHub Pages 대시보드에 매일 반영
---

매일 실행되는 자동화 작업이다. 목표: 구글 시트에 쌓인 "연령대별 구매 top10" 최신 데이터를 읽어서, GitHub Pages로 배포된 정적 대시보드(index.html)에 반영하고 push한다.

**중요 — 명령어 작성 규칙**: 아래 모든 명령은 반드시 `cd`로 디렉토리를 이동하지 말고, `git -C "<repo경로>"` 형태나 절대경로 인자로 직접 실행한다 (`cd "..." && ...` 형태는 권한 승인이 매번 "한 번만 허용"으로만 떠서 자동화가 막히므로 사용하지 말 것).

## 0. 배경
- 시트(`국내 자사몰 연령대별 상품 TOP 10`, https://docs.google.com/spreadsheets/d/1r_uz6bSUNHbyF49lsUqhwGlEb17hbKWHSUzn6K1ocVU )는 별도의 Google Apps Script가 매일 자체적으로(`runDailyRefresh`, 구글 클라우드에서 실행) 갱신한다 — 이 작업의 책임이 아니다. 이 작업은 시트를 "읽기"만 해서 대시보드 코드에 반영하는 것만 담당한다.
- 대시보드 저장소: `C:\Users\딥다이브\Desktop\verish-age-top10-dashboard` (git 저장소, origin = https://github.com/dhlee-blip/verish-age-top10-dashboard.git, `gh auth login` 인증되어 있어 push에 별도 인증 불필요).
- 배포 URL: https://dhlee-blip.github.io/verish-age-top10-dashboard/ (GitHub Pages, master 브랜치 루트 — push만 하면 GitHub가 알아서 빌드)
- 시트 구조: A주 시작일 B주 종료일 C연령대 D순위 E상품명(SKU 정제) F판매수량 G주문건수. 헤더 1행 + 데이터.
- `index.html` 안의 `var RAW = { ... };` 블록은 `// RAW_DATA_START` / `// RAW_DATA_END` 주석 사이에 있고, `regenerate_dashboard.mjs`가 자동으로 다시 만든다 (직접 손으로 편집하지 말 것).

## 1. 시트 내용 가져오기
Google Drive MCP의 `read_file_content` 도구를 fileId `1r_uz6bSUNHbyF49lsUqhwGlEb17hbKWHSUzn6K1ocVU` 로 호출한다. 반환된 마크다운 표 텍스트 전체를 Write 도구로 다음 경로에 그대로 저장한다 (절대경로로 바로 지정, cd 불필요):
`C:\Users\딥다이브\Desktop\verish-age-top10-dashboard\sheet_export.txt`

## 2. 대시보드 데이터 재생성
Bash로 절대경로를 인자로 줘서 실행한다 (cd 사용하지 않음):
```
node "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard\regenerate_dashboard.mjs" --sheet-text "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard\sheet_export.txt" --index-html "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard\index.html"
```
- 정상이면 `updated index.html: N week(s), M row(s) parsed, ... revenue days: R` 라고 출력된다.
- `no data rows parsed from sheet export -- aborting` 가 나오면 시트를 못 읽었거나 형식이 바뀐 것 — index.html은 안 바뀌었으니 안전하다. 이 경우 push하지 말고 실패 사실과 원인 추정을 보고하고 종료한다.
- `unknown age label "..." -- row skipped` 경고는 몇 건 스킵됐는지 최종 보고에 포함한다 (전체 실패로 보지 않음).
- **`revenue days: 0`이 나오면 매출 표(일별매출: 날짜/주문건수/합계매출/객단가)가 `sheet_export.txt`에서 누락된 것 — 1단계에서 시트 텍스트를 옮겨 적을 때 두 번째 표를 빠뜨렸을 가능성이 높다 (과거 실제로 이 실수가 있었음).** 이 경우:
  1. `sheet_export.txt`에 `합계매출` 문자열이 있는지 확인한다 (예: `grep -c "합계매출" sheet_export.txt`). 없으면 1단계로 돌아가 `read_file_content` 결과 전체(두 표 모두)를 빠짐없이 다시 저장하고 2단계를 재실행한다.
  2. 재실행 후에도 `revenue days: 0`이면 시트 자체에 매출 데이터가 없는 것이므로, TOP10 데이터는 정상 반영하되 최종 보고에 "매출 차트 데이터 누락"을 반드시 눈에 띄게 언급한다 — 조용히 넘기지 않는다.

## 3. 변경 여부 확인 후 커밋 & push
```
git -C "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard" diff --quiet -- index.html; echo "EXIT_CODE=$?"
```
- `EXIT_CODE=0`(변경 없음) — 커밋/push 하지 않고 "오늘은 시트 데이터에 변화가 없어 대시보드를 그대로 두었다"고 보고하고 종료한다.
- 변경이 있으면(`EXIT_CODE=1`):
```
git -C "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard" add index.html
git -C "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard" commit -m "Daily data refresh"
git -C "C:\Users\딥다이브\Desktop\verish-age-top10-dashboard" push
```

## 4. 완료 보고
사용자에게 다음을 간단히 요약해서 보고한다: 몇 주차 데이터가 반영됐는지, 총 행 수, **매출 차트 데이터 일수(revenue days)**, push 여부(또는 변경 없음), 스킵된 행이 있었다면 그 내용, 실패했다면 어디서 왜 실패했는지. 배포 URL(https://dhlee-blip.github.io/verish-age-top10-dashboard/)도 함께 알려준다.

## 참고사항
- 이 작업은 Claude Code 앱이 켜져 있어야 실행된다 (꺼져 있으면 다음 실행 때 처리됨 — 이 스크립트는 매번 시트의 "현재 상태"를 그대로 반영하는 방식이라 며칠 건너뛰어도 다음 실행에 자동으로 따라잡는다. 별도 날짜별 backfill 로직 불필요).
- 모든 명령은 절대경로 + `-C` 방식으로만 실행할 것. `cd` 로 이동 후 실행하는 방식은 쓰지 말 것.
