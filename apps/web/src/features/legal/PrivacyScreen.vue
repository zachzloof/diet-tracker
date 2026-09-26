<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LegalLayout from './LegalLayout.vue'
import { APP_NAME, LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from './legal'
</script>

<template>
  <LegalLayout title="Privacy policy" :updated="LEGAL_UPDATED">
    <p>
      {{ APP_NAME }} is a free nutrition tracker. This page says what it stores about you, what
      leaves the server, and how to take your data with you or delete it. It is written in plain
      language on purpose.
    </p>

    <h2>What we store</h2>
    <ul>
      <li>Your email address and a hashed version of your password (never the password).</li>
      <li>
        Your profile: sex, date of birth, height, weight, body fat if you gave it, goal and pace,
        activity and training, diet pattern, allergies, dislikes, time zone, units, and the health
        answers from onboarding (pregnancy, breastfeeding, eating-disorder history).
      </li>
      <li>Your daily targets and their history.</li>
      <li>Everything you log: meals, foods, water, weigh-ins and notes.</li>
      <li>Your saved foods and the AI's weekly reviews.</li>
      <li>
        For each AI request: which model answered, how many tokens it used, how long it took and
        whether it worked. Not the text.
      </li>
      <li>Session records so you stay signed in, with the browser's user agent string.</li>
    </ul>

    <h2>What the AI sees</h2>
    <p>
      When you type what you ate, ask for a plan explanation or open the weekly review, the app
      sends a request to OpenAI. The request contains the text you typed, a summary of your profile
      (sex, age, height, weight, goal, activity, diet pattern, allergies and dislikes) and your
      targets or your week's numbers. It never contains your email address or any account
      identifier. Requests are sent with storage switched off, so OpenAI does not keep them to train
      models. For a named product the AI may search the web for the label; the search query is the
      product name, nothing else.
    </p>

    <h2>On your phone</h2>
    <p>
      The app keeps a copy of your recent days, targets and weigh-ins in the browser so it works
      without a connection, plus any meals waiting to be sent, your theme and reminder settings.
      Signing out clears the copy. Reminders run on your device and are never sent anywhere.
    </p>

    <h2>What we do not do</h2>
    <ul>
      <li>No advertising, no analytics, no tracking pixels, no third-party cookies.</li>
      <li>We do not sell or share your data with anyone other than the processors below.</li>
    </ul>

    <h2>Who processes the data</h2>
    <ul>
      <li>Railway hosts the server and the database.</li>
      <li>OpenAI answers the AI requests described above.</li>
    </ul>
    <p>All traffic between your phone and the server is encrypted (HTTPS).</p>

    <h2>Your controls</h2>
    <ul>
      <li>
        <RouterLink :to="{ name: 'settings' }">Settings</RouterLink> exports everything as JSON, or
        the food log and weigh-ins as CSV.
      </li>
      <li>
        Deleting your account in Settings removes every row that belongs to you, immediately. There
        is no recovery period.
      </li>
      <li>You can change your password, units and time zone at any time.</li>
    </ul>

    <h2>Not medical advice</h2>
    <p>
      Targets are general guidance computed from published formulas and reference intakes. They are
      not a prescription, a diagnosis or a treatment. The app is for adults aged 18 and over. If you
      are pregnant, breastfeeding, have a history of disordered eating or a medical condition that
      affects what you eat, work with a doctor or dietitian.
    </p>

    <h2>Contact</h2>
    <p v-if="LEGAL_CONTACT_EMAIL">
      Questions or requests: <a :href="`mailto:${LEGAL_CONTACT_EMAIL}`">{{ LEGAL_CONTACT_EMAIL }}</a
      >.
    </p>
    <p v-else>Questions or requests: contact the person who gave you the link to this app.</p>
  </LegalLayout>
</template>
