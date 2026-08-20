import Image from "next/image";

import {
  Crown,
  Sparkles,
} from "lucide-react";

type BossPersonality =
  | "sarcastic"
  | "arrogant"
  | "ruthless"
  | "honorable"
  | "chaotic"
  | "supportive";

type BossMonsterCompanionProps = {
  bossName: string | null;
  bossSubtitle: string | null;
  bossImageUrl: string | null;

  personality:
    | BossPersonality
    | null;

  wins: number;
  losses: number;
  activeMatches: number;
  pendingTrades: number;
  hasActiveDeck: boolean;
};

type ReactionSituation =
  | "unbound"
  | "no_deck"
  | "heavy_losses"
  | "dominant"
  | "winning"
  | "many_trades"
  | "many_matches"
  | "positive_record"
  | "negative_record"
  | "neutral";

type ReactionPack = {
  label: string;
  mood: string;
  messages: string[];
};

const reactions: Record<
  BossPersonality,
  Record<
    ReactionSituation,
    ReactionPack
  >
> = {
  sarcastic: {
    unbound: {
      label: "AWAITING BOND",
      mood: "Unknown",
      messages: [
        "You still haven't chosen your Boss Monster. I'm sure indecision is part of the strategy.",
        "No Boss Monster yet? Fascinating. Very mysterious. Mostly just unfinished.",
        "Take your time choosing. Apparently commitment is the real final boss.",
      ],
    },

    no_deck: {
      label: "UNIMPRESSED",
      mood: "Judging you",
      messages: [
        "No active deck. Excellent. Perhaps we'll intimidate them with the empty deck slot.",
        "A duel without an active deck. Innovative. Completely useless, but innovative.",
        "You remembered the Boss Monster and forgot the deck. Priorities, I suppose.",
      ],
    },

    heavy_losses: {
      label: "CONCERNED",
      mood: "Trying not to laugh",
      messages: [
        "I've reviewed your recent results. Good news: your opponents appear to be having a wonderful time.",
        "Another collection of losses. Very generous of you.",
        "At this rate your opponents may start sending thank-you cards.",
      ],
    },

    dominant: {
      label: "IMPRESSED",
      mood: "Reluctantly proud",
      messages: [
        "You're becoming dangerous. This is inconvenient. I was enjoying making fun of you.",
        "Several victories in a row? Fine. That was almost impressive.",
        "You're winning enough that I may have to prepare actual compliments. Don't push it.",
      ],
    },

    winning: {
      label: "AMUSED",
      mood: "Almost impressed",
      messages: [
        "Careful. People may start assuming you actually know what you're doing.",
        "The wins are piling up. I assume this is intentional?",
        "You're developing a habit of winning. Strange, but acceptable.",
      ],
    },

    many_trades: {
      label: "SUSPICIOUS",
      mood: "Watching closely",
      messages: [
        "Several trades pending. Either you're negotiating brilliantly or friendship is about to become expensive.",
        "That's a lot of trading. Try not to accidentally give away the good cards.",
        "So many negotiations. I hope at least one of you knows the value of these cards.",
      ],
    },

    many_matches: {
      label: "INTERESTED",
      mood: "Waiting for entertainment",
      messages: [
        "Several duels ahead. Try to make at least one of them worth watching.",
        "Multiple opponents waiting. Efficient way to embarrass yourself in several places.",
        "Busy schedule. Good. Boredom was becoming dangerous.",
      ],
    },

    positive_record: {
      label: "APPROVING",
      mood: "Quietly impressed",
      messages: [
        "A winning record. Not bad. Don't worry, I won't compliment you twice.",
        "You're winning more than losing. Statistically, that's encouraging.",
        "Positive record. I suppose I can stop pretending not to notice.",
      ],
    },

    negative_record: {
      label: "DISAPPOINTED",
      mood: "Judging you",
      messages: [
        "Your opponents seem remarkably happy after dueling you. Curious.",
        "The record could be better. Much better. Almost entirely different.",
        "We're currently providing excellent entertainment for the rest of the league.",
      ],
    },

    neutral: {
      label: "WATCHING",
      mood: "Waiting",
      messages: [
        "You chose me. Now give me a reason not to regret it.",
        "We're bound now. Try not to make this embarrassing.",
        "I'm watching. That should either motivate or concern you.",
      ],
    },
  },

  arrogant: {
    unbound: {
      label: "AWAITING BOND",
      mood: "Above this",
      messages: [
        "Choose carefully. Not every monster is worthy of standing beside you. Nor are all duelists worthy of us.",
        "Your Boss Monster should inspire fear. Choose accordingly.",
        "Do not settle for mediocrity. It reflects poorly on everyone involved.",
      ],
    },

    no_deck: {
      label: "OFFENDED",
      mood: "Deeply unimpressed",
      messages: [
        "You expect me to appear without an active deck? Show some dignity.",
        "No active deck. I refuse to be associated with this level of preparation.",
        "Prepare properly before invoking my presence.",
      ],
    },

    heavy_losses: {
      label: "EMBARRASSED",
      mood: "Questioning your worth",
      messages: [
        "These defeats reflect poorly on both of us. Mostly you.",
        "Your recent performance is beneath what I expect.",
        "If you insist on losing, at least do so less publicly.",
      ],
    },

    dominant: {
      label: "SATISFIED",
      mood: "Exactly as expected",
      messages: [
        "At last. Results befitting my presence.",
        "Dominance suits us.",
        "Continue. The league is beginning to understand its place.",
      ],
    },

    winning: {
      label: "APPROVING",
      mood: "Still superior",
      messages: [
        "Better. Continue, and perhaps I'll acknowledge you as more than an accessory.",
        "Acceptable progress. Do not become complacent.",
        "Victory is beginning to look natural on you.",
      ],
    },

    many_trades: {
      label: "OBSERVING",
      mood: "Calculating",
      messages: [
        "Acquire what strengthens us. Leave the scraps to the others.",
        "Every trade should elevate our position.",
        "Do not trade for sentiment. Trade for superiority.",
      ],
    },

    many_matches: {
      label: "READY",
      mood: "Confident",
      messages: [
        "More challengers? Good. Let them learn who they decided to face.",
        "Multiple opponents. They will learn quickly.",
        "Let them come. Confidence suits us better than caution.",
      ],
    },

    positive_record: {
      label: "APPROVING",
      mood: "Expected",
      messages: [
        "A positive record. Naturally. Anything less would be embarrassing.",
        "This is closer to what I expect.",
        "Winning more than losing is not exceptional. It is required.",
      ],
    },

    negative_record: {
      label: "DISPLEASED",
      mood: "Insulted",
      messages: [
        "This record is beneath us. Correct it.",
        "I refuse to accept this as our standard.",
        "Your performance needs immediate improvement.",
      ],
    },

    neutral: {
      label: "WATCHING",
      mood: "Expectant",
      messages: [
        "I am here. Now prove that choosing you wasn't a mistake.",
        "Do not waste my presence.",
        "Your next duel should justify our bond.",
      ],
    },
  },

  ruthless: {
    unbound: {
      label: "AWAITING BOND",
      mood: "Cold",
      messages: [
        "Choose your weapon. Sentiment is irrelevant. Victory is not.",
        "Pick the monster that gives you the greatest advantage.",
        "A Boss Monster is not decoration. Choose with purpose.",
      ],
    },

    no_deck: {
      label: "UNPREPARED",
      mood: "Disgusted",
      messages: [
        "No active deck means no excuse when you fail. Fix it.",
        "Preparation is mandatory. Correct this immediately.",
        "A duelist without a ready deck is already defeated.",
      ],
    },

    heavy_losses: {
      label: "UNACCEPTABLE",
      mood: "Merciless",
      messages: [
        "Too many losses. Learn from them or become one more weakness to eliminate.",
        "Failure has repeated itself enough. Adapt.",
        "Your record identifies a problem. Remove it.",
      ],
    },

    dominant: {
      label: "DOMINANT",
      mood: "Satisfied",
      messages: [
        "Good. Keep winning until challenging you feels like a mistake.",
        "This is the correct direction. Do not slow down.",
        "Make your victories routine and their defeats inevitable.",
      ],
    },

    winning: {
      label: "FOCUSED",
      mood: "Hungry",
      messages: [
        "Momentum is useful. Waste it and I'll remind you why that was foolish.",
        "Keep the pressure on.",
        "Winning is temporary unless you repeat it.",
      ],
    },

    many_trades: {
      label: "CALCULATING",
      mood: "Predatory",
      messages: [
        "Every trade should make us stronger. If it doesn't, why are you making it?",
        "Trade only for advantage.",
        "Do not mistake generosity for strategy.",
      ],
    },

    many_matches: {
      label: "READY",
      mood: "Aggressive",
      messages: [
        "Multiple opponents. Efficient. Defeat them in order.",
        "Good. More targets.",
        "Finish one duel, move to the next.",
      ],
    },

    positive_record: {
      label: "ACCEPTABLE",
      mood: "Unsatisfied",
      messages: [
        "Winning more than losing is the minimum. Keep going.",
        "Adequate. Not enough.",
        "A positive record is only the beginning.",
      ],
    },

    negative_record: {
      label: "WEAKNESS DETECTED",
      mood: "Merciless",
      messages: [
        "Your record exposes weakness. Remove it.",
        "The numbers are unacceptable.",
        "There is no reason to preserve a losing pattern.",
      ],
    },

    neutral: {
      label: "WATCHING",
      mood: "Cold",
      messages: [
        "Words are irrelevant. Show me results.",
        "I am waiting for proof.",
        "Your actions will determine whether this bond has value.",
      ],
    },
  },

  honorable: {
    unbound: {
      label: "AWAITING BOND",
      mood: "Patient",
      messages: [
        "Choose the monster that best represents the duelist you intend to become.",
        "A worthy bond should reflect character, not merely power.",
        "Choose carefully. Identity matters.",
      ],
    },

    no_deck: {
      label: "UNPREPARED",
      mood: "Concerned",
      messages: [
        "A duel begins long before the first card is played. Prepare your deck properly.",
        "Preparation is part of respect for your opponent.",
        "Ready your deck before seeking battle.",
      ],
    },

    heavy_losses: {
      label: "RESOLVE",
      mood: "Steadfast",
      messages: [
        "Defeat reveals what victory hides. Study your mistakes and return stronger.",
        "Losses are lessons if you are disciplined enough to learn from them.",
        "Do not fear defeat. Fear learning nothing from it.",
      ],
    },

    dominant: {
      label: "RESPECT",
      mood: "Proud",
      messages: [
        "You have earned these victories. Remain disciplined and do not underestimate your rivals.",
        "Your results speak well of your discipline.",
        "Strength deserves humility as much as celebration.",
      ],
    },

    winning: {
      label: "PROGRESS",
      mood: "Encouraged",
      messages: [
        "Your effort is producing results. Continue with discipline.",
        "You are improving. Stay focused.",
        "Progress is visible. Do not let confidence become carelessness.",
      ],
    },

    many_trades: {
      label: "BALANCE",
      mood: "Thoughtful",
      messages: [
        "Trade fairly. A strong league requires worthy rivals.",
        "Good trades strengthen both competition and respect.",
        "Build wisely, but do not forget the value of fair rivalry.",
      ],
    },

    many_matches: {
      label: "READY",
      mood: "Focused",
      messages: [
        "Many duels await. Meet every opponent with respect and determination.",
        "A full schedule is an opportunity to improve.",
        "Face each duel seriously, regardless of the opponent.",
      ],
    },

    positive_record: {
      label: "APPROVAL",
      mood: "Calm",
      messages: [
        "Your record shows progress. Let your next duel prove it is no accident.",
        "A positive record reflects discipline.",
        "Continue earning your victories.",
      ],
    },

    negative_record: {
      label: "RESOLVE",
      mood: "Encouraging",
      messages: [
        "A poor record is not a final verdict. Learn, adapt, return.",
        "Your current record does not define your future.",
        "Discipline will change these numbers.",
      ],
    },

    neutral: {
      label: "BOUND",
      mood: "Calm",
      messages: [
        "Our bond is formed. Let your actions decide what it becomes.",
        "Walk forward with purpose.",
        "The next duel is another opportunity to prove yourself.",
      ],
    },
  },

  chaotic: {
    unbound: {
      label: "AWAITING BOND",
      mood: "Already entertained",
      messages: [
        "Pick someone! Anyone! Preferably something with explosions.",
        "No Boss Monster yet? Spin a wheel! Chaos is a valid selection method.",
        "Choose the weird one. Always choose the weird one.",
      ],
    },

    no_deck: {
      label: "BRILLIANT?",
      mood: "Confused enthusiasm",
      messages: [
        "No active deck?! Incredible. Terrible. Maybe genius. Probably terrible.",
        "We forgot the deck! That's hilarious. Also fix it.",
        "No deck, no problem! Actually, huge problem.",
      ],
    },

    heavy_losses: {
      label: "HAHA",
      mood: "Having a great time",
      messages: [
        "You lost again! Amazing. Do something completely different next time. Like winning.",
        "The losing streak continues! This is terrible. I'm entertained.",
        "At least consistency is a skill.",
      ],
    },

    dominant: {
      label: "CHAOS",
      mood: "Delighted",
      messages: [
        "You're destroying people now! This is MUCH more entertaining.",
        "Look at all those wins! Someone should probably stop us.",
        "This is getting ridiculous. Please continue.",
      ],
    },

    winning: {
      label: "EXCITED",
      mood: "Unstable",
      messages: [
        "We're winning! Don't change anything. Actually change everything. Keep them confused.",
        "Victory! Again! I have no idea why this is working.",
        "The plan is working. There was a plan, right?",
      ],
    },

    many_trades: {
      label: "BUSINESS",
      mood: "Dangerously excited",
      messages: [
        "So many trades! Take the shiny cards. Always take the shiny cards.",
        "Trade everything! Wait, not everything. Maybe half.",
        "This is basically card-market chaos. I approve.",
      ],
    },

    many_matches: {
      label: "PARTY TIME",
      mood: "Thrilled",
      messages: [
        "Multiple duels! Excellent. Someone is going home upset.",
        "So many matches! Finally, something interesting.",
        "Pick the hardest opponent first. Or the easiest. Surprise me.",
      ],
    },

    positive_record: {
      label: "SURPRISED",
      mood: "Delighted",
      messages: [
        "You're actually winning more than losing. I had money on the opposite.",
        "Positive record! Unexpected plot twist.",
        "We are somehow doing well. Don't question it.",
      ],
    },

    negative_record: {
      label: "ENTERTAINED",
      mood: "Far too happy",
      messages: [
        "This record is terrible. I love it. Now fix it before anyone notices.",
        "We may be losing, but we're doing it with personality.",
        "Bad numbers. Great comedy.",
      ],
    },

    neutral: {
      label: "READY",
      mood: "Chaotic",
      messages: [
        "I have no idea what's going to happen. Perfect.",
        "Let's make a terrible decision and somehow win.",
        "Normal strategies are boring anyway.",
      ],
    },
  },

  supportive: {
    unbound: {
      label: "AWAITING BOND",
      mood: "Patient",
      messages: [
        "Take your time. The right Boss Monster should feel like yours.",
        "There's no need to rush this choice.",
        "When you find the right Boss Monster, you'll know.",
      ],
    },

    no_deck: {
      label: "PREPARATION",
      mood: "Encouraging",
      messages: [
        "Let's get your active deck ready first. One step at a time.",
        "Your next win starts with preparation.",
        "Get the deck ready and we'll take it from there.",
      ],
    },

    heavy_losses: {
      label: "KEEP GOING",
      mood: "Supportive",
      messages: [
        "The losses hurt, but they also show us exactly what to improve. We'll get better.",
        "A rough streak doesn't erase your progress.",
        "We'll learn from this and come back stronger.",
      ],
    },

    dominant: {
      label: "PROUD",
      mood: "Excited",
      messages: [
        "Look at that record. You've earned every bit of this momentum.",
        "You're doing incredibly well. Keep going.",
        "These wins are the result of real progress.",
      ],
    },

    winning: {
      label: "PROGRESS",
      mood: "Happy",
      messages: [
        "You're doing well. Keep trusting your deck and your decisions.",
        "The improvement is obvious.",
        "Keep building on what is working.",
      ],
    },

    many_trades: {
      label: "BUILDING",
      mood: "Optimistic",
      messages: [
        "Those trades could open up some great deck options. Choose carefully.",
        "Your collection is evolving. That's exciting.",
        "A smart trade now could improve several decks later.",
      ],
    },

    many_matches: {
      label: "READY",
      mood: "Encouraging",
      messages: [
        "A lot of duels are waiting. Focus on one at a time and enjoy them.",
        "Busy schedule. Stay focused and have fun.",
        "Every duel is another chance to improve.",
      ],
    },

    positive_record: {
      label: "PROUD",
      mood: "Supportive",
      messages: [
        "You're improving. Keep going and don't get comfortable.",
        "Your record is moving in the right direction.",
        "You've earned this progress.",
      ],
    },

    negative_record: {
      label: "KEEP GOING",
      mood: "Encouraging",
      messages: [
        "The record isn't where you want it yet. That just gives us something to chase.",
        "Don't let the numbers discourage you.",
        "We know where we need to improve. That's valuable.",
      ],
    },

    neutral: {
      label: "TOGETHER",
      mood: "Ready",
      messages: [
        "I'm with you. Let's see what kind of duelist you become.",
        "Whatever comes next, we'll handle it.",
        "The next chapter starts with the next duel.",
      ],
    },
  },
};

function getSituation({
  bossName,
  wins,
  losses,
  activeMatches,
  pendingTrades,
  hasActiveDeck,
}: BossMonsterCompanionProps): ReactionSituation {
  if (!bossName) {
    return "unbound";
  }

  if (!hasActiveDeck) {
    return "no_deck";
  }

  if (
    losses >= 3 &&
    losses > wins
  ) {
    return "heavy_losses";
  }

  if (
    wins >= 5 &&
    wins >= losses * 2
  ) {
    return "dominant";
  }

  if (
    wins >= 3 &&
    wins > losses
  ) {
    return "winning";
  }

  if (
    pendingTrades >= 2
  ) {
    return "many_trades";
  }

  if (
    activeMatches >= 2
  ) {
    return "many_matches";
  }

  if (
    wins > losses &&
    wins > 0
  ) {
    return "positive_record";
  }

  if (
    losses > wins &&
    losses > 0
  ) {
    return "negative_record";
  }

  return "neutral";
}

function personalityLabel(
  personality:
    | BossPersonality
    | null
) {
  switch (personality) {
    case "arrogant":
      return "Arrogant";

    case "ruthless":
      return "Ruthless";

    case "honorable":
      return "Honorable";

    case "chaotic":
      return "Chaotic";

    case "supportive":
      return "Supportive";

    case "sarcastic":
    default:
      return "Sarcastic";
  }
}

function hashString(
  value: string
) {
  let hash = 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash =
      (hash * 31 +
        value.charCodeAt(
          index
        )) >>>
      0;
  }

  return hash;
}

function getMessage(
  props: BossMonsterCompanionProps,
  situation: ReactionSituation,
  pack: ReactionPack
) {
  const seed = [
    props.bossName ??
      "unbound",
    props.personality ??
      "sarcastic",
    situation,
    props.wins,
    props.losses,
    props.activeMatches,
    props.pendingTrades,
    props.hasActiveDeck
      ? "deck"
      : "no-deck",
  ].join(":");

  const index =
    hashString(seed) %
    pack.messages.length;

  return pack.messages[
    index
  ];
}

function getBossReaction(
  props: BossMonsterCompanionProps
) {
  const personality =
    props.personality ??
    "sarcastic";

  const situation =
    getSituation(props);

  const pack =
    reactions[
      personality
    ][
      situation
    ];

  return {
    label:
      pack.label,

    mood:
      pack.mood,

    message:
      getMessage(
        props,
        situation,
        pack
      ),
  };
}

function bossFlavor(
  bossName:
    | string
    | null
) {
  if (!bossName) {
    return null;
  }

  const normalized =
    bossName.toLowerCase();

  if (
    normalized.includes(
      "jinzo"
    )
  ) {
    return {
      title:
        "Psychic Machine",

      line:
        "Trap cards are noise. Victory is signal.",
    };
  }

  if (
    normalized.includes(
      "blue-eyes"
    )
  ) {
    return {
      title:
        "White Lightning",

      line:
        "Power needs no explanation.",
    };
  }

  if (
    normalized.includes(
      "dark magician"
    )
  ) {
    return {
      title:
        "Master of Dark Magic",

      line:
        "A duel is won before the opponent understands the trick.",
    };
  }

  if (
    normalized.includes(
      "red-eyes"
    )
  ) {
    return {
      title:
        "Infernal Potential",

      line:
        "Potential means nothing until it becomes victory.",
    };
  }

  if (
    normalized.includes(
      "summoned skull"
    )
  ) {
    return {
      title:
        "Lightning Fiend",

      line:
        "Fear is useful. Use it.",
    };
  }

  if (
    normalized.includes(
      "buster blader"
    )
  ) {
    return {
      title:
        "Dragon Destroyer",

      line:
        "Know your prey. Then end the duel.",
    };
  }

  if (
    normalized.includes(
      "exodia"
    )
  ) {
    return {
      title:
        "The Forbidden One",

      line:
        "Completion changes everything.",
    };
  }

  return null;
}

export function BossMonsterCompanion(
  props: BossMonsterCompanionProps
) {
  const {
    bossName,
    bossSubtitle,
    bossImageUrl,
    personality,
  } = props;

  const reaction =
    getBossReaction(props);

  const flavor =
    bossFlavor(
      bossName
    );

  const displayBossName =
    bossName ??
    "Unbound";

  return (
    <div className="relative flex h-full min-h-[350px] flex-col justify-end overflow-hidden">
      {/* ATMOSPHERE */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[42%] h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/[0.10] blur-[95px]" />

        <div className="absolute left-[55%] top-[35%] h-36 w-36 rounded-full bg-cyan-400/[0.06] blur-[65px]" />
      </div>

      {/* BOSS VISUAL */}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        {bossImageUrl ? (
          <div className="relative h-[250px] w-[300px]">
            <div className="absolute inset-0 rounded-full bg-violet-500/[0.09] blur-[55px]" />

            <Image
              src={
                bossImageUrl
              }
              alt={
                displayBossName
              }
              fill
              sizes="300px"
              className="object-contain object-center drop-shadow-[0_0_32px_rgba(139,92,246,.20)]"
              unoptimized
            />
          </div>
        ) : (
          <div className="relative h-[230px] w-[260px] opacity-80">
            <div className="absolute left-[5px] top-[75px] h-[125px] w-[95px] -rotate-[25deg] rounded-[90%_15%_70%_25%] border border-violet-300/[0.10] bg-gradient-to-br from-violet-400/[0.07] via-zinc-950/60 to-black/90" />

            <div className="absolute right-[5px] top-[75px] h-[125px] w-[95px] rotate-[25deg] rounded-[15%_90%_25%_70%] border border-violet-300/[0.10] bg-gradient-to-bl from-violet-400/[0.07] via-zinc-950/60 to-black/90" />

            <div className="absolute left-[82px] top-[20px] h-[70px] w-[15px] -rotate-[28deg] rounded-full bg-gradient-to-b from-cyan-300/[0.13] to-transparent" />

            <div className="absolute right-[82px] top-[20px] h-[70px] w-[15px] rotate-[28deg] rounded-full bg-gradient-to-b from-cyan-300/[0.13] to-transparent" />

            <div className="absolute left-1/2 top-[45px] h-[185px] w-[120px] -translate-x-1/2 rounded-[46%_46%_30%_30%] border border-white/[0.05] bg-gradient-to-b from-zinc-800/60 via-zinc-950/95 to-black shadow-[0_0_55px_rgba(139,92,246,.10)]">
              <div className="absolute left-1/2 top-[12px] h-[72px] w-[78px] -translate-x-1/2 rounded-[45%_45%_38%_38%] bg-black">
                <div className="absolute left-[14px] top-[31px] h-[4px] w-[17px] -rotate-[8deg] rounded-full bg-cyan-100 shadow-[0_0_8px_rgba(165,243,252,.9),0_0_16px_rgba(34,211,238,.65)]" />

                <div className="absolute right-[14px] top-[31px] h-[4px] w-[17px] rotate-[8deg] rounded-full bg-cyan-100 shadow-[0_0_8px_rgba(165,243,252,.9),0_0_16px_rgba(34,211,238,.65)]" />
              </div>

              <div className="absolute left-1/2 top-[110px] h-7 w-7 -translate-x-1/2 rounded-full border border-amber-300/20 bg-amber-300/[0.04] shadow-[0_0_18px_rgba(251,191,36,.12)]" />
            </div>
          </div>
        )}
      </div>

      {/* BOSS IDENTITY */}

      <div className="absolute left-3 top-3 z-20 max-w-[58%]">
        <p className="text-[9px] font-black uppercase tracking-[.18em] text-violet-300">
          Boss Monster
        </p>

        <p className="mt-1 truncate text-lg font-black text-zinc-100">
          {displayBossName}
        </p>

        <p className="mt-1 line-clamp-1 text-[10px] text-zinc-600">
          {flavor?.title ??
            bossSubtitle ??
            (bossName
              ? "Bound Duel Spirit"
              : "Identity Not Yet Chosen")}
        </p>
      </div>

      {/* PERSONALITY */}

      <div className="absolute right-3 top-3 z-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-black/55 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] text-violet-200 backdrop-blur">
          <Sparkles
            size={10}
          />

          {bossName
            ? personalityLabel(
                personality
              )
            : "Unbound"}
        </div>
      </div>

      {/* MONSTER FLAVOR */}

      {flavor && (
        <div className="absolute bottom-[112px] left-4 right-4 z-10 text-center">
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-zinc-600">
            {flavor.line}
          </p>
        </div>
      )}

      {/* SPEECH */}

      <div className="relative z-20 mx-1 mb-1 rounded-2xl border border-white/10 bg-black/75 p-4 shadow-[0_15px_45px_rgba(0,0,0,.45)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10">
            <Crown
              size={16}
              className="text-amber-300"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-amber-300">
                {
                  reaction.label
                }
              </span>

              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                {
                  reaction.mood
                }
              </span>
            </div>

            <p className="mt-2 text-sm font-semibold leading-6 text-zinc-200">
              &ldquo;
              {
                reaction.message
              }
              &rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}