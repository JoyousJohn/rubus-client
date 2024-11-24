<p align="center">
  RUBus is a feature-packed progressive web app (PWA) alternative to the Passio GO! apps for Rutgers University–New Brunswick.
  <em>This project is unaffiliated with Rutgers and Passio Technologies.</em>
  <br><br>
  <img src="https://github.com/user-attachments/assets/fce7fc0e-7cac-4f11-a23f-1bd8ca345b34" width="23%" />
  <img src="https://github.com/user-attachments/assets/a7da8d6b-8828-4d18-ab37-c0a9dd19c154" width="23%" /> 
  <img src="https://github.com/user-attachments/assets/56fe6db9-bde0-4706-9d40-f20de15a7fbd" width="23%" />
  <img src="https://github.com/user-attachments/assets/f087c8ba-3cdf-4903-997a-3ace45089a63" width="23%"/>
</p>

<p align="center">
    <img src="https://github.com/user-attachments/assets/58347ed7-8c5a-4048-9612-eb9f08322fe4" width="23%"/>
    <img src="https://github.com/user-attachments/assets/27569e3d-7e77-423e-b2a4-1c9772d14955" width="23%"/>
</p>

<br>
RUBus features real-time bus locations, bearings, capacities, speeds, time stopped, ETAs, loop time, and live and historical ridership, alongside customization options. Bus positioning is fetched from the Passio API while live speed and ridership estimations are calculated on the client.
<br><br>
This repo does not provide or include a method by which to calculate ETAs. Your own external endpoints or sockets will have to be set if you're computing these server-side.
<br><br>
Alternatively, you can use Passio's own ETA endpoint, although the methodology they use to calculate ETA is unclear:

`GET passiogo.com/mapGetData.php?eta=<int>&routeId=<int>&stopIds=<int list>&routeIds=<int list>`
<br><br>
Interestingly, the ETA endpoint also returns bus speed while the positioning endpoint does not. This can be used as an alternate source of speed if bandwith is not a concern. It's unclear whether this is actual real speed though, as the returned key is named "calculatedSpeed".
<br><br>
You will also need to supply your own map tiles API key in `js/maps.js` and LineString, routes, and stops in `lib/` if you're using these. You can also fetch from server to guarantee latest version; check `getStopsData()` removed in commit `ad0767c` to see how this was previously done. Update the Font Awesome Kit key in `index.html` if you'd like to use the same icons.
<br><br>
This app can easily be made to service another bus network Passio handles by changing the form data parameters in `js/pre.js` and map coordinates and bounds in `js/map.js`.
