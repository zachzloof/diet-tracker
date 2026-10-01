<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LegalLayout from './LegalLayout.vue'
import { APP_NAME, LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR, LEGAL_UPDATED } from './legal'
</script>

<template>
  <LegalLayout title="Privacy policy" :updated="LEGAL_UPDATED">
    <p>
      {{ APP_NAME }} is a free nutrition tracker. This page says what it stores about you, what
      leaves the server, and how to take your data with you or delete it. It is written in plain
      language on purpose.
    </p>

    <h2>Who is responsible</h2>
    <p>
      {{ APP_NAME }} is run by {{ LEGAL_OPERATOR ?? 'an independent developer' }}, who decides how
      your data is used (the "data controller" in UK data protection law). How to get in touch is at
      the bottom of this page.
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
      <li>Your saved foods and meals, and the AI's weekly reviews.</li>
      <li>
        For each AI request: which model answered, how many tokens it used, how long it took and
        whether it worked. Not the text.
      </li>
      <li>When you agreed to your health information being stored.</li>
      <li>
        Session records so you stay signed in, with the browser's or the app's user agent string.
      </li>
    </ul>

    <h2>Why we are allowed to</h2>
    <p>
      Your email address and password are needed to give you an account, which is the service you
      asked for. Your body measurements, what you eat, your weight and your answers to the health
      questions are health information, which the law protects more strongly: we store and use it
      only because you gave your explicit agreement when you set up your profile, and only to work
      out and track your targets. You can withdraw that agreement at any time by deleting your
      account, which removes the information.
    </p>

    <h2>How long we keep it</h2>
    <ul>
      <li>
        Your food log, daily totals, weigh-ins, weekly reviews, the AI usage records and targets
        that have since been replaced are deleted automatically once they are more than six months
        old.
      </li>
      <li>
        Your account, profile, current targets and saved foods and meals are kept until you delete
        them or your account.
      </li>
      <li>A sign-in on a device ends 30 days after you last used it there.</li>
    </ul>

    <h2>What the AI sees</h2>
    <p>
      The AI features are off until you allow them, and you can turn them off again in
      <RouterLink :to="{ name: 'settings' }">Settings</RouterLink>. Once allowed, when you type what
      you ate, open your plan's explanation or open the weekly review, the app sends a request to
      OpenAI, a separate company that provides the AI model. The request contains the text you
      typed, a summary of your profile (sex, age, height, weight, goal, activity, diet pattern,
      allergies and dislikes) and your targets or your week's numbers. It never contains your email
      address or any account identifier. Requests are sent with storage switched off, so OpenAI does
      not keep them to train models. For a named product the AI may search the web for the label;
      the search query is the product name, nothing else.
    </p>

    <h2>On your phone</h2>
    <p>
      The app keeps a copy of your recent days, targets and weigh-ins on the device so it works
      without a connection, plus any meals waiting to be sent, your theme, your reminder settings
      and your answer about the AI features. Signing out clears the copy. The iPhone and Android
      apps keep the key that keeps you signed in in the phone's secure storage. Reminders run on
      your device and are never sent anywhere. The apps ask for no other permissions: no location,
      no contacts, no camera, no health data from the phone.
    </p>

    <h2>What we do not do</h2>
    <ul>
      <li>
        No advertising, no analytics, no tracking across apps or websites, no cookies from anyone
        else.
      </li>
      <li>We do not sell or share your data with anyone other than the processors below.</li>
    </ul>

    <h2>Who processes the data</h2>
    <ul>
      <li>Railway hosts the server and the database.</li>
      <li>OpenAI answers the AI requests described above.</li>
    </ul>
    <p>
      Both are companies based in the United States, so your data may be stored or processed outside
      the United Kingdom and the European Economic Area, under the data protection terms those
      companies give their customers. All traffic between your phone and the server is encrypted
      (HTTPS).
    </p>

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
      <li>
        You can correct anything in your profile, your log and your weigh-ins, and switch the AI
        features off, in the app.
      </li>
    </ul>
    <p>
      These are your rights to see, correct, move and erase your data and to withdraw consent. If
      you think your data has been handled wrongly, tell us first if you can; you also have the
      right to complain to the UK Information Commissioner's Office at
      <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
    </p>

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
