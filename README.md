## Inspiration
Growing up, we've always been big on sports. Before school, during school, and after, we'd play soccer, race, and do all kinds of things together. We'd join teams, compete with each other, and just try to get better.

As we got into high school, things changed. My friend stopped playing because of budget constraints, while I continued playing, especially basketball both in and out of school. But even when I was on a team, I could only get proper coaching during practices, which weren't all the time. A lot of the work still had to be done alone. Sometimes I'd even get advice from strangers. Whether what I was doing was formally right or wrong, I was still able to improve by experimenting and finding what worked for me.

Later in college, we both got really into boxing, and I also picked running back up after having done it since elementary school. That brought us back to the same idea we'd had growing up: how do you keep improving when you don't always have someone there to coach you?

That's where ReStride came from.

We wanted to make something for people who want to improve on their own. Instead of telling you what the "perfect" movement looks like, ReStride lets you record a movement that you know you can perform well and use it as your own reference.

You know the saying, "If it ain't broke, don't fix it."

We made ReStride around that idea. Rather than advertising a universally recognized standard for how you should move, we want you to set your own standard and improve against it.

## What it does
You strap your phone to your chest and record a reference trial of yourself performing a movement. ReStride uses the phone's motion sensors to capture your movement over time.

When you perform the movement again, ReStride compares your current movement against your own reference. If you begin to deviate from the movement you previously performed well, ReStride can provide an audio cue to bring your attention back to it.

Afterwards, you can see the trials overlaid and examine where your movement changed.

The goal isn't to tell you that your form is universally "wrong." It's to help you reproduce a movement that you've already demonstrated you can perform.

## How we built it
ReStride is a web application built around the motion sensors already available in a smartphone.

The frontend uses JavaScript's device motion APIs to collect accelerometer and gyroscope data directly from the phone. During a trial, movement analysis and feedback happen locally on the device so that network latency doesn't interfere with real-time feedback.

After a trial, the raw sensor data is sent to a Python FastAPI backend. The backend processes the time-series data using NumPy and SciPy, including signal smoothing and stride detection.

We then use the processed data to align trials and compare the athlete's movement against their reference.

The frontend is deployed separately from the backend, with the backend hosted on Render.

## Challenges we ran into
One of our biggest challenges was figuring out how to reliably interpret raw phone sensor data.

A phone's accelerometer and gyroscope produce noisy measurements, and simply integrating acceleration to calculate distance or speed introduces significant drift. Because of this, we decided not to pretend our phone could accurately measure things it wasn't well suited for.

Instead, we focused on measurements we could defend: movement patterns, timing, stride events, and differences between trials.

We also had to figure out how to give feedback during a sprint without relying on the network. This led us to move real-time deviation detection onto the phone itself, while leaving heavier processing for the backend after the trial.

Another challenge was working within the limitations of a mobile browser, particularly around accessing device sensors and providing a consistent experience across devices.

## Accomplishments that we're proud of
We're proud that we were able to turn hardware we already carry every day into a useful sports sensor without requiring specialized equipment.

We're also proud of the idea behind the reference trial. Instead of comparing every athlete to the same predefined standard, ReStride allows the athlete to establish their own baseline.

Most importantly, we're proud that we built something that reflects the reason we started the project in the first place: helping someone improve even when they don't have a coach standing beside them.

## What we learned
We learned that building a project like this involves a lot more than getting the main idea working.

We had to learn how to work with real sensor data, deal with noise and imperfect measurements, design around the limitations of mobile browsers, and decide which measurements were actually reliable enough to use.

We also learned the importance of knowing when **not** to overcomplicate something. There were many things we could have tried to calculate, but if we couldn't justify that the result was accurate, we chose not to use it.

## What's next for ReStride
Our next step is to move ReStride from a web application into a native phone app. This would give us much better access to the phone's sensors and allow us to cache the data and processing needed for a trial directly on the device.

Our goal is for a user to be able to use ReStride without needing Wi-Fi or a reliable internet connection, especially during an outdoor workout or run. A trial could be recorded, analyzed, and stored locally, with the backend only being used when an internet connection is available for things like syncing or more intensive analysis.

We also want to expand ReStride beyond sprinting and explore other sports and movements, as well as eventually making the phone mounting setup more practical through a dedicated sports vest or wearable.

Ultimately, we want ReStride to make high-quality movement feedback more accessible to people who don't always have access to a coach, trainer, or team practice.
