// Scripted chats for the README screenshots. Everything here is made up,
// places and shops included.

const ANSWER_SATURDAY = `Here's a vegetarian Saturday around Indiranagar, all within a 10-minute walk:

- **Brunch at Juniper & Rye**, 12th Main. Opens at 9, the shakshuka and millet pancakes are vegetarian, and it's not on your list of places you've been.
- **Blossom Leaf Books**, 100 Feet Road, 6 minutes away. Second-hand fiction upstairs, open till 9 pm.
- **Coffee after** at Third Wave Lane, right next to the bookshop.

Want me to book the brunch table for 11?`;

const ANSWER_ERROR = `Code **51** means the bank declined the payment for **insufficient funds** (or the card's limit). It isn't a problem with the site.

What to try:
1. Check the card's balance or daily limit in your bank app.
2. Pay with another card or UPI.
3. If the balance is fine, call the bank: some cards block the first online payment to a new merchant.`;

const stream = (title, steps, answer) => [
  { event: "run_started" },
  { event: "conversation", conversation_id: "conv_demo", run_id: "run_demo", title },
  { event: "subagent_started", iteration: 1, subagent: "react", task: title },
  ...steps.flatMap(([tool, args, result, thought]) => [
    ...(thought ? [{ event: "thinking_delta", delta: thought }] : []),
    { event: "subagent_tool_call", subagent: "react", tool, args },
    { event: "subagent_tool_result", subagent: "react", tool, result },
  ]),
  { event: "answer_delta", delta: answer, step: steps.length },
  { event: "subagent_completed", iteration: 1, subagent: "react", result: answer.slice(0, 200) },
  { event: "final", answer, iterations: 1, satisfactory: true, mode: "direct" },
];

export const CHATS = [
  {
    match: "Saturday",
    question: "Plan my Saturday near Indiranagar: brunch somewhere I haven't been, then a bookshop close by.",
    waitFor: "Juniper",
    events: stream(
      "Saturday plan near Indiranagar",
      [
        ["recall_memory", { query: "food preferences and places visited" }, "- The user is vegetarian.\n- Has been to Toit and Café Azure.", "Checking what I know about food preferences first. "],
        ["websearch_agent", { query: "new brunch cafes Indiranagar vegetarian" }, "5 results", "Now looking for brunch places nearby. "],
        ["website_agent", { url: "https://example.com/juniper-and-rye", question: "opening hours and vegetarian dishes" }, "Opens 9 am; vegetarian menu", null],
        ["websearch_agent", { query: "bookshop near 12th Main Indiranagar" }, "3 results", "Then a bookshop within walking distance. "],
      ],
      ANSWER_SATURDAY,
    ),
  },
  {
    match: "error",
    question: "What does this error mean, and what should I try?",
    waitFor: "insufficient funds",
    events: stream("Card declined, code 51", [], ANSWER_ERROR),
  },
];

export const uploadFor = () => ({
  ok: true,
  filename: "checkout-error.png",
  saved_as: "checkout-error.png",
  path: "uploads/checkout-error.png",
  download_url: "/api/upload/files/checkout-error.png",
  size: 41231,
  content_type: "image/png",
});
