import pandas as pd
import numpy as np

#df = pd.read_csv('salaries.csv')   ##Read csv files
#print(df['Salary'].mean())    ##grabbing column Data

#ser_of_bool = df['Age'] > 30
#print(ser_of_bool)
#print(df[ser_of_bool]) ## 조건을 만족하는 Dataframe Return

#print(df[df['Age'] > 30])

#print(df['Age'].unique()) ##해당 column의 Unique value Return

#print(df['Age'].nunique()) ##해당 columb의 Unique value length Return

#print(df.columns) ##해당 dataframe의 column name and type Return

#print(df.info()) ##해당 datarame의 report Return such as entries, coumn name, data type, memory usage

#print(df.describe()) ##해당 dataframe actural columns의 mean, std, quartile, min, max Return

#print(df.index) ##해당 dataframe의 column index Return

mat = np.arange(0, 10).reshape(5,2)

df = pd.DataFrame(data=mat, columns=['A','B'])
print(df)
