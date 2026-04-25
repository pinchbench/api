-- Correct benchmark_versions.semver and benchmark_versions.label values created by
-- earlier backfills/submissions that treated legacy IDs as 0.0.1 or accepted
-- two-component values such as "1.0" as sortable semver.
--
-- This is forward-only and D1/SQLite compatible. It intentionally avoids temp
-- tables so it can run in Cloudflare D1 migrations.

-- Strict semver-ish benchmark IDs already contain major.minor.patch. Restore
-- their sortable semver and display label directly from the ID, including
-- prerelease/build forms such as 2.0.0-rc1 and 2.0.0-rc.1+build.5.
-- The checks below validate the core before any '-' or '+' suffix, require
-- non-empty suffixes, and allow only one '+'. Values with extra dot components,
-- such as 1.2.3.4, remain in the legacy bucket.
UPDATE benchmark_versions
SET semver = id,
    label = id
WHERE id NOT GLOB '*[^0-9A-Za-z.+-]*'
  AND (length(id) - length(replace(id, '+', ''))) <= 1
  AND (instr(id, '+') = 0 OR instr(id, '+') < length(id))
  AND (
    instr(id, '-') = 0
    OR (instr(id, '+') > 0 AND instr(id, '+') < instr(id, '-'))
    OR (
      instr(id, '-') < length(id)
      AND (instr(id, '+') = 0 OR instr(id, '+') > instr(id, '-') + 1)
    )
  )
  AND (
    CASE
      WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
      WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
      ELSE id
    END
  ) NOT GLOB '*[^0-9.]*'
  AND (
    length(
      CASE
        WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
        WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
        ELSE id
      END
    ) - length(replace(
      CASE
        WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
        WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
        ELSE id
      END,
      '.',
      ''
    ))
  ) = 2
  AND (
    CASE
      WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
      WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
      ELSE id
    END
  ) NOT LIKE '.%'
  AND (
    CASE
      WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
      WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
      ELSE id
    END
  ) NOT LIKE '%.'
  AND (
    CASE
      WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
      WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
      ELSE id
    END
  ) NOT LIKE '%..%';

-- Legacy/non-strict IDs get stable beta labels ordered by created_at ASC, id ASC.
-- This bucket includes git hashes, names, and ambiguous two-component IDs such
-- as "1.0", which the TypeScript semver parser treats as invalid for sorting.
UPDATE benchmark_versions
SET semver = '1.0.0-beta.' || CAST((
      SELECT COUNT(*) + 1
      FROM benchmark_versions AS older
      WHERE NOT (
          older.id NOT GLOB '*[^0-9A-Za-z.+-]*'
          AND (length(older.id) - length(replace(older.id, '+', ''))) <= 1
          AND (instr(older.id, '+') = 0 OR instr(older.id, '+') < length(older.id))
          AND (
            instr(older.id, '-') = 0
            OR (instr(older.id, '+') > 0 AND instr(older.id, '+') < instr(older.id, '-'))
            OR (
              instr(older.id, '-') < length(older.id)
              AND (instr(older.id, '+') = 0 OR instr(older.id, '+') > instr(older.id, '-') + 1)
            )
          )
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT GLOB '*[^0-9.]*'
          AND (
            length(
              CASE
                WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
                WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
                ELSE older.id
              END
            ) - length(replace(
              CASE
                WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
                WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
                ELSE older.id
              END,
              '.',
              ''
            ))
          ) = 2
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT LIKE '.%'
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT LIKE '%.'
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT LIKE '%..%'
        )
        AND (
          older.created_at < benchmark_versions.created_at
          OR (
            older.created_at = benchmark_versions.created_at
            AND older.id < benchmark_versions.id
          )
        )
    ) AS TEXT),
    label = '1.0.0-beta.' || CAST((
      SELECT COUNT(*) + 1
      FROM benchmark_versions AS older
      WHERE NOT (
          older.id NOT GLOB '*[^0-9A-Za-z.+-]*'
          AND (length(older.id) - length(replace(older.id, '+', ''))) <= 1
          AND (instr(older.id, '+') = 0 OR instr(older.id, '+') < length(older.id))
          AND (
            instr(older.id, '-') = 0
            OR (instr(older.id, '+') > 0 AND instr(older.id, '+') < instr(older.id, '-'))
            OR (
              instr(older.id, '-') < length(older.id)
              AND (instr(older.id, '+') = 0 OR instr(older.id, '+') > instr(older.id, '-') + 1)
            )
          )
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT GLOB '*[^0-9.]*'
          AND (
            length(
              CASE
                WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
                WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
                ELSE older.id
              END
            ) - length(replace(
              CASE
                WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
                WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
                ELSE older.id
              END,
              '.',
              ''
            ))
          ) = 2
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT LIKE '.%'
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT LIKE '%.'
          AND (
            CASE
              WHEN instr(older.id, '-') > 0 AND (instr(older.id, '+') = 0 OR instr(older.id, '-') < instr(older.id, '+')) THEN substr(older.id, 1, instr(older.id, '-') - 1)
              WHEN instr(older.id, '+') > 0 THEN substr(older.id, 1, instr(older.id, '+') - 1)
              ELSE older.id
            END
          ) NOT LIKE '%..%'
        )
        AND (
          older.created_at < benchmark_versions.created_at
          OR (
            older.created_at = benchmark_versions.created_at
            AND older.id < benchmark_versions.id
          )
        )
    ) AS TEXT)
WHERE NOT (
    id NOT GLOB '*[^0-9A-Za-z.+-]*'
    AND (length(id) - length(replace(id, '+', ''))) <= 1
    AND (instr(id, '+') = 0 OR instr(id, '+') < length(id))
    AND (
      instr(id, '-') = 0
      OR (instr(id, '+') > 0 AND instr(id, '+') < instr(id, '-'))
      OR (
        instr(id, '-') < length(id)
        AND (instr(id, '+') = 0 OR instr(id, '+') > instr(id, '-') + 1)
      )
    )
    AND (
      CASE
        WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
        WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
        ELSE id
      END
    ) NOT GLOB '*[^0-9.]*'
    AND (
      length(
        CASE
          WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
          WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
          ELSE id
        END
      ) - length(replace(
        CASE
          WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
          WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
          ELSE id
        END,
        '.',
        ''
      ))
    ) = 2
    AND (
      CASE
        WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
        WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
        ELSE id
      END
    ) NOT LIKE '.%'
    AND (
      CASE
        WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
        WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
        ELSE id
      END
    ) NOT LIKE '%.'
    AND (
      CASE
        WHEN instr(id, '-') > 0 AND (instr(id, '+') = 0 OR instr(id, '-') < instr(id, '+')) THEN substr(id, 1, instr(id, '-') - 1)
        WHEN instr(id, '+') > 0 THEN substr(id, 1, instr(id, '+') - 1)
        ELSE id
      END
    ) NOT LIKE '%..%'
  );
