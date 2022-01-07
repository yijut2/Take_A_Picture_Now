import { Component, ElementRef, OnInit, ViewChild, Output, EventEmitter, SystemJsNgModuleLoader } from '@angular/core';
import * as handTrack from 'handtrackjs';
import { PredictionEvent } from '../prediction-event';
import * as $ from "jquery";

@Component({
  selector: 'app-handtracker',
  templateUrl: './handtracker.component.html',
  styleUrls: ['./handtracker.component.css']
})
export class HandtrackerComponent implements OnInit {
  @Output() onPrediction = new EventEmitter<PredictionEvent>();
  @ViewChild('htvideo') video: ElementRef;
  @ViewChild("canvas") canvas: ElementRef;
  
  /* 
  SAMPLERATE determines the rate at which detection occurs (in milliseconds)
  500, or one half second is about right, but feel free to experiment with faster
  or slower rates
  */
  SAMPLERATE: number = 500; 
  
  detectedGesture:string = "None"
  width:string = "400"
  height:string = "400"

  private model: any = null;
  private runInterval: any = null;
  public timeleft : number;
  public captures: string[] = [];
  public error: any;
  public isCaptured: boolean;
  public isTakingPhoto: boolean = false;
  public curr_index: number = -1;
  public isSetting: boolean = false;
  public descriptions : string[] = [];
  public hide : boolean = true;
  //public caption : string;

  //handTracker model
  private modelParams = {
    flipHorizontal: true, // flip e.g for video
    maxNumBoxes: 5, // maximum number of boxes to detect
    iouThreshold: 0.5, // ioU threshold for non-max suppression
    scoreThreshold: 0.9, // confidence threshold for predictions.
  };

  constructor() {
  }
  
  ngOnInit(): void{
    handTrack.load(this.modelParams).then((lmodel: any) =>{
        this.model = lmodel;
        console.log("loaded");
    });
  }

  ngOnDestroy(): void{
      this.model.dispose();
  }

  startVideo(): Promise<any> {
    return handTrack.startVideo(this.video.nativeElement).then(function(status: any){
        return status;
    }, (err: any) => { return err; }) 
  }

  startDetection(){
    this.startVideo().then(()=>{
        //The default size set in the library is 20px. Change here or use styling
        //to hide if video is not desired in UI.
        this.video.nativeElement.style.height = "600px"

        console.log("starting predictions");
        this.runInterval = setInterval(()=>{
            this.runDetection();
        }, this.SAMPLERATE);
    }, (err: any) => { console.log(err); });
  }

  stopDetection(){
    console.log("stopping predictions");
    clearInterval(this.runInterval);
    handTrack.stopVideo(this.video.nativeElement);
  }

  /*
    runDetection demonstrates how to capture predictions from the handTrack library.
    It is not feature complete! Feel free to change/modify/delete whatever you need
    to meet your desired set of interactions
  */
  runDetection(){
    if (this.model != null){
        let predictions = this.model.detect(this.video.nativeElement).then((predictions: any) => {
            if (predictions.length <= 0) return;
            
            let openhands = 0;
            let closedhands = 0;
            let pointing = 0;
            let pinching = 0;
            for(let p of predictions){
                //uncomment to view label and position data
                console.log(p.label + " at X: " + p.bbox[0] + ", Y: " + p.bbox[1] + " at X: " + p.bbox[2] + ", Y: " + p.bbox[3]);
                
                if(p.label == 'open') openhands++;
                if(p.label == 'closed') closedhands++;
                if(p.label == 'point') pointing++;
                if(p.label == 'pinch') pinching++;
                
            }

            // These are just a few options! What about one hand open and one hand closed!?
            var that = this;

            // 2 open hands --> move to next picture
            if (openhands > 1){
              this.detectedGesture = "Show Next Photo (2 Open Hands)";
              if (!this.isSetting && this.curr_index >= 0){
                this.isSetting = true;
                if (this.curr_index < this.captures.length-1){
                  this.curr_index += 1;
                }else{
                  this.curr_index = 0;
                }
                this.setPhoto(this.curr_index);      
                setTimeout( function() {
                  that.isSetting = false;
                },2000);
              }
            } 
            // Taking Picture
            else if(pointing == 2) 
            {
              this.detectedGesture = "Taking Picture...(2 pointing Hands)";
              if (!this.isTakingPhoto){
                this.isTakingPhoto = true;
                this.countdown();
                setTimeout( function() {
                  that.capture();
                  that.isTakingPhoto = false;
                  that.curr_index = that.captures.length-1;
                },3000);
                
              }
            }
            //move to previous photo
            else if (closedhands > 1) 
            {
              this.detectedGesture = "Show Previous Photo (2 Closed Hands)";
              if (!this.isSetting && this.curr_index >= 0){
                this.isSetting = true;
                if (this.curr_index > 0){
                  this.curr_index -= 1;
                }else{
                  this.curr_index = this.captures.length-1;
                }
                this.setPhoto(this.curr_index);
                setTimeout( function() {
                  that.isSetting = false;
                },2000);
              }

            }
            //show photo
            else if(closedhands == 0 && openhands == 1 && pointing == 0) 
            {
              this.detectedGesture = "Open the Gallery (1 Opened Hand)";
              if (this.curr_index < 0){
                this.curr_index = 0;
                this.setPhoto(this.curr_index);
              }
              
            }
            //hide photo
            else if(closedhands == 1 && openhands == 0 && pointing == 0) 
            {
              this.detectedGesture = "Close the Gallery (1 Hand Closed)";
              this.clearImageOnCanvas();
              this.curr_index = -1;
            }
            //show input bar
            else if (closedhands == 1 && pointing == 1){
              this.hide = false;
              this.detectedGesture = "Show Input Bar (1 Hand Pointing, 1 Hand Closed)";
            }
            else if (openhands == 0 && closedhands == 0 && pointing == 0 && pinching == 0)
                this.detectedGesture = "None";
            //add description            
            else if (openhands == 0 && closedhands == 0 && pointing == 1)
            {
              this.detectedGesture = "Add Description (1 Hand Pointing)";
              this.addDescription(); 
            }

            // if (pinching > 1) this.detectedGesture = "Two Hands Pinching";
            // else if(pinching == 1) this.detectedGesture = "Hand Pinching";

            this.onPrediction.emit(new PredictionEvent(this.detectedGesture))
        }, (err: any) => {
            console.log("ERROR")
            console.log(err)
        });
    }else{
        console.log("no model")
    }
  }

  addDescription(){
    if (this.curr_index >=0){
      let description;
      description = (<HTMLInputElement>document.getElementById("description")).value;
      if (description !== "")
        this.descriptions[this.curr_index] = description;
        (<HTMLInputElement>document.getElementById("description")).value = "";
        // window.alert(this.descriptions[this.curr_index]+" "+this.curr_index+ " "+this.descriptions.length);

    }
  }

  setPhoto(idx: number) {
    this.isCaptured = true;
  
    var image = new Image();
    image.src = this.captures[idx];
    if (this.captures.length !== 0)
    {
      this.drawImageToCanvas(image);
    }


  }

  capture() {
    this.drawImageToCanvas(this.video.nativeElement);
    this.captures.push(this.canvas.nativeElement.toDataURL("image/png"));
    this.isCaptured = true;
    this.descriptions.push("");
    console.log("CAPTURE");
  }

  drawImageToCanvas(image: any) {
    this.canvas.nativeElement
      .getContext("2d")
      .drawImage(image, 0, 0, this.width, this.height);
  }

  clearImageOnCanvas() {
    this.canvas.nativeElement
      .getContext("2d")
      .clearRect(0, 0, this.width, this.height);
    // this.captures.forEach((value: boolean, key: string) => {
    //   this.captures.set(key, false);
    // });
    //this.hide = true;
  }


  countdown() {
    var timeleft = 5;
    console.log(timeleft);
    var downloadTimer = setInterval(function(){
      if(timeleft <= 0){
        clearInterval(downloadTimer);
        return;
      }
    timeleft -= 1;
    $("#progressBar").attr("value", 5 - timeleft); //npm i --save-dev @types/jquery
    }, 1000);
  } 
}
