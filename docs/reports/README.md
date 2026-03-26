# QA Reports

이 디렉터리는 백엔드 유닛 테스트를 넘어서는 QA 결과물의 정본 보관소다.

## 분류 기준

- `docs/reports/backend/`: 백엔드 API를 대상으로 수행한 블랙박스 QA, smoke/regression 결과, 장애보고서, 후속 대응 계획
- `tests/`: 재실행 가능한 QA 자동화 코드
- 백엔드 레포에는 구현과 함께 유지되어야 하는 단위 테스트, 통합 테스트 코드, 기술 설계 문서만 남긴다.

## 정본 위치 표

| 산출물 | 정본 위치 | 소유 레포 |
| --- | --- | --- |
| 블랙박스 QA 결과 보고서 | `docs/reports/backend/` | QA |
| smoke/regression 결과 | `docs/reports/backend/` | QA |
| 장애보고서 / 대응 계획 | `docs/reports/backend/` | QA |
| 재실행 가능한 QA 자동화 | `tests/`, `scripts/` | QA |
| 백엔드 unit/integration 테스트 | 백엔드 소스 트리 | BE |
| 백엔드 기술 설계 문서 | 백엔드 `docs/` | BE |

## 현재 이관된 백엔드 QA 문서

- `backend/2026-03-25-backend-main-qa-incident-report.md`
- `backend/2026-03-25-backend-main-qa-countermeasure-plan.md`
- `backend/2026-03-25-backend-fix-61-duplicate-nickname-409-qa-incident-report.md`

## 운영 원칙

- QA 실행 결과와 장애보고서는 이 레포에 누적한다.
- 백엔드 레포에서는 필요할 때 이 경로를 링크만 참조한다.
- 동일 성격 문서를 여러 레포에 중복 보관하지 않는다.
