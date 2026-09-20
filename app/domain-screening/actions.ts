"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import type { DomainKey, DomainScreeningQuestion } from "@/lib/types";

const SCREENING_QUESTIONS: DomainScreeningQuestion[] = [
  { id: "r1", domain: "relationships", question: "В отношениях с близкими часто возникает недопонимание?", order: 1 },
  { id: "r2", domain: "relationships", question: "Ты часто берёшь на себя вину за то, что происходит не в твоей зоне ответственности?", order: 2 },
  { id: "r3", domain: "relationships", question: "Тебе сложно отказать, даже когда хочешь?", order: 3 },

  { id: "m1", domain: "money", question: "У тебя есть постоянное чувство, что денег никогда не хватает?", order: 1 },
  { id: "m2", domain: "money", question: "Ты избегаешь смотреть в цифры/счета/бюджет?", order: 2 },
  { id: "m3", domain: "money", question: "Боишься брать больше денег за свою работу/проекты?", order: 3 },

  { id: "h1", domain: "health", question: "Часто чувствуешь усталость, которая не проходит после отдыха?", order: 1 },
  { id: "h2", domain: "health", question: "Откладываешь визит к врачу/проверку, хотя знаешь, что пора?", order: 2 },
  { id: "h3", domain: "health", question: "Еда/сон/движение — в этом есть явная проблема, которую ты игнорируешь?", order: 3 },

  { id: "p1", domain: "purpose", question: "Часто чувствуешь, что делаешь что-то бессмысленное?", order: 1 },
  { id: "p2", domain: "purpose", question: "Ты знаешь, чего хочешь, но не можешь сформулировать, зачем тебе это?", order: 2 },
  { id: "p3", domain: "purpose", question: "Завидуешь тому, что у других есть понятное «призвание»?", order: 3 },

  { id: "s1", domain: "safety", question: "Часто ощущаешь тревогу «а что, если худшее»?", order: 1 },
  { id: "s2", domain: "safety", question: "Ты держишься за текущее положение/доход/отношения, даже когда это плохо, только потому что «неизвестность страшнее»?", order: 2 },
  { id: "s3", domain: "safety", question: "Ты привык планировать всё до мелочей, и срыв плана вызывает панику?", order: 3 },

  { id: "b1", domain: "belonging", question: "Часто чувствуешь, что тебя не понимают или ты «не вписываешься»?", order: 1 },
  { id: "b2", domain: "belonging", question: "Ты избегаешь новых сообществ/встреч, потому что «всё равно не будет своим»?", order: 2 },
  { id: "b3", domain: "belonging", question: "Боишься, что если люди узнают тебя настоящего — отвергнут?", order: 3 },
];

export async function getScreeningQuestions(): Promise<DomainScreeningQuestion[]> {
  return SCREENING_QUESTIONS;
}

export async function submitScreeningAnswers(
  clientUuid: string,
  answers: { questionId: string; answer: string; domain: DomainKey }[]
): Promise<{ flagged: DomainKey[] }> {
  const supabase = getSupabaseServerClient();
  const rows = answers.map((a) => ({
    client_uuid: clientUuid,
    domain: a.domain,
    question: SCREENING_QUESTIONS.find((q) => q.id === a.questionId)?.question || a.questionId,
    answer: a.answer,
    flagged: false,
  }));

  const { error } = await supabase.from("domain_screening_answers").insert(rows);
  if (error) {
    throw new Error(error.message || "Failed to save screening answers");
  }

  const flagged = answers
    .filter((a) => a.answer.trim().toLowerCase() === "да")
    .map((a) => a.domain);

  const uniqueFlagged = Array.from(new Set(flagged));

  return { flagged: uniqueFlagged };
}
