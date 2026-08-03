# 국내 자사몰 연령대별 상품 TOP 10 대시보드

Verish 자사몰(Cafe24) 주문 데이터 기준, 연령대별 최다 판매 상품을 주 단위로 보여주는 대시보드입니다.

- **집계 기준 토글** — SKU 단위(옵션까지 구분) / 판매 상품명 단위(옵션 무관하게 상품 단위로 합산), 둘 중 하나를 골라 아래 세 섹션 모두에 적용
- **스냅샷** — 주차 선택 시 해당 주 연령대별 TOP 10
- **트렌드** — 연령대별 최근 주간 순위 변화(범프 차트)
- **교차 분석** — 연령대 간 공통 인기 상품 vs 특화 상품 매트릭스

취소·환불 건은 집계에서 제외되었습니다 (BigQuery `cafe24_order_detail`의 유효 주문 상태 기준으로 검증 완료).

정적 페이지이며, `verish-dashboard-daily-sync` 예약 작업(로컬 Claude Code 스케줄)이 매일 구글 시트 최신 데이터를 읽어 `regenerate_dashboard.mjs`로 반영하고 GitHub Pages에 push합니다 — 자세한 흐름은 `docs/verish-dashboard-daily-sync.SKILL.md` 참고.
