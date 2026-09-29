import type { NewStrategy } from "@/lib/types";

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-black dark:text-zinc-50">{title}</p>
      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </div>
  );
}

export function hasStrategyDetails(strategy: NewStrategy): boolean {
  return Boolean(
    strategy.approach ||
      strategy.resources?.length ||
      strategy.support?.length ||
      strategy.timeline ||
      strategy.budget ||
      strategy.investment ||
      strategy.avoid?.length ||
      strategy.assumptions?.length ||
      (strategy.time_to_launch &&
        (strategy.time_to_launch.days_to_first_step > 0 ||
          strategy.time_to_launch.days_to_result > 0 ||
          strategy.time_to_launch.note)),
  );
}

/** Детали стратегии из ответа модели: подход, ресурсы, поддержка, сроки, бюджет, ловушки, допущения. */
export function StrategyDetails({ strategy }: { strategy: NewStrategy }) {
  const timeToLaunch = strategy.time_to_launch;

  return (
    <div className="space-y-4 text-sm">
      {strategy.approach && <DetailBlock title="Подход">{strategy.approach}</DetailBlock>}

      {strategy.resources?.length > 0 && (
        <DetailBlock title="Ресурсы">
          <div className="space-y-3">
            {strategy.resources.map((resource, index) => (
              <div key={index} className="rounded-lg bg-white p-3 dark:bg-zinc-900">
                <p className="font-medium text-black dark:text-zinc-50">{resource.category}</p>
                {resource.items.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {resource.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{item}</li>
                    ))}
                  </ul>
                )}
                {resource.rationale && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{resource.rationale}</p>
                )}
              </div>
            ))}
          </div>
        </DetailBlock>
      )}

      {strategy.support?.length > 0 && (
        <DetailBlock title="Поддержка">
          <div className="space-y-3">
            {strategy.support.map((support, index) => (
              <div key={index} className="rounded-lg bg-white p-3 dark:bg-zinc-900">
                <p className="font-medium text-black dark:text-zinc-50">
                  {support.who}
                  {support.needed ? " — нужен на старте" : " — позже"}
                </p>
                {support.description && <p className="mt-1">{support.description}</p>}
              </div>
            ))}
          </div>
        </DetailBlock>
      )}

      {timeToLaunch && (
        <DetailBlock title="Время до запуска">
          <p>До первого шага: {timeToLaunch.days_to_first_step} дн.</p>
          <p>До результата этапа: {timeToLaunch.days_to_result} дн.</p>
          {timeToLaunch.note && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{timeToLaunch.note}</p>
          )}
        </DetailBlock>
      )}

      {strategy.timeline && <DetailBlock title="Сроки">{strategy.timeline}</DetailBlock>}
      {strategy.budget && <DetailBlock title="Бюджет">{strategy.budget}</DetailBlock>}
      {strategy.investment && <DetailBlock title="Вложения">{strategy.investment}</DetailBlock>}

      {strategy.avoid?.length > 0 && (
        <DetailBlock title="Чего избегать">
          <ul className="list-disc space-y-1 pl-5">
            {strategy.avoid.map((avoid, index) => (
              <li key={index}>
                <span className="font-medium text-black dark:text-zinc-100">{avoid.rule}</span> — {avoid.reason}
              </li>
            ))}
          </ul>
        </DetailBlock>
      )}

      {strategy.assumptions?.length > 0 && (
        <DetailBlock title="Допущения">
          <ul className="list-disc space-y-1 pl-5">
            {strategy.assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>
        </DetailBlock>
      )}
    </div>
  );
}
